/**
 * Byte-level media transfer without buffering whole files.
 *
 * Downloads read ranges straight from `upload.GetFile`; uploads push parts with
 * `upload.SaveFilePart` / `upload.SaveBigFilePart` as the bytes arrive. Both follow
 * Telegram's file rules (https://core.telegram.org/api/files):
 *   - GetFile: offset and limit divisible by 4096, 1 MiB divisible by limit,
 *     and a request must not cross a 1 MiB boundary;
 *   - uploads: every part but the last is the same size, 512 KiB divides it,
 *     and files above 10 MiB use the "big" calls with the part count known up front.
 */
import bigInt from "big-integer";
import type { TelegramClient } from "telegram";
import { Api } from "telegram/tl/index.js";
import { generateRandomBigInt } from "./telegram-helpers.js";

/** Telegram's upload cap for regular accounts: 4000 parts of 512 KiB. */
export const TELEGRAM_MAX_FILE_BYTES = 2000 * 1024 * 1024;
export const UPLOAD_PART_BYTES = 512 * 1024;
/** Above this size Telegram requires SaveBigFilePart + InputFileBig. */
export const BIG_FILE_THRESHOLD_BYTES = 10 * 1024 * 1024;
/** Largest GetFile request Telegram accepts; streaming uses it aligned to itself. */
const DOWNLOAD_REQUEST_BYTES = 512 * 1024;
const MIN_ALIGN = 4096;
const UPLOAD_CONCURRENCY = 4;
/** Enough for an ISO-BMFF `ftyp` box with a handful of compatible brands. */
const SNIFF_BYTES = 64;
const MAX_DC_MIGRATIONS = 3;

export type MediaErrorCode =
  | "MESSAGE_NOT_FOUND"
  | "NO_MEDIA"
  | "MEDIA_NOT_DOWNLOADABLE"
  | "MEDIA_UNAVAILABLE"
  | "FILE_REFERENCE_EXPIRED"
  | "MEDIA_TOO_LARGE"
  | "RATE_LIMITED"
  | "DOWNLOAD_FAILED"
  | "UPLOAD_SIZE_MISMATCH"
  | "UPLOAD_FAILED"
  | "INVALID_RANGE"
  | "MEDIA_CHANGED";

/** Error with a stable machine-readable code. `retryAfterMs` is set for retryable failures. */
export class TelegramMediaError extends Error {
  readonly code: MediaErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  constructor(code: MediaErrorCode, message: string, opts: { retryable?: boolean; retryAfterMs?: number } = {}) {
    super(message);
    this.name = "TelegramMediaError";
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

/** Duck-typed check: works across duplicated module instances. */
export function isTelegramMediaError(e: unknown): e is TelegramMediaError {
  return (
    e instanceof TelegramMediaError ||
    (e instanceof Error && e.name === "TelegramMediaError" && typeof (e as { code?: unknown }).code === "string")
  );
}

export interface MediaInfo {
  kind: "document" | "photo";
  /** Opaque identity of the file (kind, id, access hash); changes when the media is replaced. */
  fileId: string;
  /** Exact byte size of the original file. */
  size: number;
  mimeType: string;
  fileName?: string;
}

/** A file already uploaded to Telegram by {@link uploadStream}, ready for a send call. */
export interface UploadedFile {
  readonly kind: "uploaded-file";
  readonly inputFile: Api.InputFile | Api.InputFileBig;
  readonly fileName: string;
  readonly size: number;
  /** MIME sniffed from the first bytes, when recognised. */
  readonly mimeType?: string;
}

/** What send methods accept: a local path (or URL where already supported) or an uploaded file. */
export type FileInput = string | UploadedFile;

export function isUploadedFile(value: unknown): value is UploadedFile {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "uploaded-file" &&
    typeof (value as { fileName?: unknown }).fileName === "string" &&
    (value as { inputFile?: unknown }).inputFile !== undefined
  );
}

// ─── Media classification ────────────────────────────────────────────────────

const MEDIA_TYPE_NAMES: Record<string, string> = {
  MessageMediaContact: "contact",
  MessageMediaGeo: "location",
  MessageMediaGeoLive: "live location",
  MessageMediaVenue: "venue",
  MessageMediaPoll: "poll",
  MessageMediaDice: "dice",
  MessageMediaGame: "game",
  MessageMediaInvoice: "invoice",
  MessageMediaStory: "story",
  MessageMediaGiveaway: "giveaway",
  MessageMediaGiveawayResults: "giveaway results",
  MessageMediaPaidMedia: "paid media",
  MessageMediaUnsupported: "unsupported media",
  MessageMediaWebPage: "link preview without a file",
  MessageMediaToDo: "checklist",
  WebDocument: "web document",
  WebDocumentNoProxy: "web document",
};

/** Human name of a non-downloadable media object, e.g. "contact" or "poll". */
function mediaTypeName(media: unknown): string {
  const className = (media as { className?: unknown } | null)?.className;
  if (typeof className !== "string") return "media";
  return MEDIA_TYPE_NAMES[className] ?? className.replace(/^MessageMedia/, "").toLowerCase();
}

export function notDownloadable(media: unknown): TelegramMediaError {
  return new TelegramMediaError(
    "MEDIA_NOT_DOWNLOADABLE",
    `This message contains a ${mediaTypeName(media)}, which has no file to download. Read the message text instead.`,
  );
}

/** True for media classes that never carry a downloadable file (GramJS fails or returns no bytes). */
export function isKnownUndownloadable(media: unknown): boolean {
  if (media instanceof Api.MessageMediaWebPage) {
    return !(media.webpage instanceof Api.WebPage && (media.webpage.document || media.webpage.photo));
  }
  return (
    media instanceof Api.MessageMediaContact ||
    media instanceof Api.MessageMediaGeo ||
    media instanceof Api.MessageMediaGeoLive ||
    media instanceof Api.MessageMediaVenue ||
    media instanceof Api.MessageMediaPoll ||
    media instanceof Api.MessageMediaDice ||
    media instanceof Api.MessageMediaGame ||
    media instanceof Api.MessageMediaInvoice ||
    media instanceof Api.MessageMediaGiveaway ||
    media instanceof Api.MessageMediaGiveawayResults ||
    media instanceof Api.MessageMediaUnsupported ||
    media instanceof Api.WebDocument ||
    media instanceof Api.WebDocumentNoProxy
  );
}

/** Resolved location of the original file of a message's media. */
export interface MediaSource {
  info: MediaInfo;
  location: Api.TypeInputFileLocation;
  dcId: number;
  /** Photo sizes Telegram already inlined into the message. */
  cached?: Buffer;
}

function photoSizeBytes(s: Api.TypePhotoSize): number {
  if (s instanceof Api.PhotoSize) return s.size;
  if (s instanceof Api.PhotoSizeProgressive) return Math.max(...s.sizes);
  if (s instanceof Api.PhotoCachedSize || s instanceof Api.PhotoStrippedSize) return s.bytes.length;
  return 0;
}

function photoSource(photo: Api.TypePhoto | undefined): MediaSource {
  if (!(photo instanceof Api.Photo)) {
    throw new TelegramMediaError("MEDIA_UNAVAILABLE", "The photo is no longer available (expired or deleted).");
  }
  const sizes = photo.sizes.filter(
    (s) => !(s instanceof Api.PhotoPathSize) && !(s instanceof Api.PhotoStrippedSize) && photoSizeBytes(s) > 0,
  );
  const largest = sizes.sort((a, b) => photoSizeBytes(a) - photoSizeBytes(b)).pop();
  if (!largest || !("type" in largest)) {
    throw new TelegramMediaError("MEDIA_UNAVAILABLE", "The photo has no downloadable size.");
  }
  const info: MediaInfo = {
    kind: "photo",
    fileId: `photo:${photo.id.toString()}:${photo.accessHash.toString()}:${largest.type}`,
    size: photoSizeBytes(largest),
    mimeType: "image/jpeg",
  };
  const location = new Api.InputPhotoFileLocation({
    id: photo.id,
    accessHash: photo.accessHash,
    fileReference: photo.fileReference,
    thumbSize: largest.type,
  });
  return {
    info,
    location,
    dcId: photo.dcId,
    ...(largest instanceof Api.PhotoCachedSize && { cached: Buffer.from(largest.bytes) }),
  };
}

function documentSource(doc: Api.TypeDocument | undefined): MediaSource {
  if (!(doc instanceof Api.Document)) {
    throw new TelegramMediaError("MEDIA_UNAVAILABLE", "The file is no longer available (expired or deleted).");
  }
  const nameAttr = doc.attributes.find(
    (a): a is Api.DocumentAttributeFilename => a instanceof Api.DocumentAttributeFilename,
  );
  const info: MediaInfo = {
    kind: "document",
    fileId: `document:${doc.id.toString()}:${doc.accessHash.toString()}`,
    size: Number(doc.size.toString()),
    mimeType: doc.mimeType || "application/octet-stream",
    ...(nameAttr?.fileName && { fileName: nameAttr.fileName }),
  };
  const location = new Api.InputDocumentFileLocation({
    id: doc.id,
    accessHash: doc.accessHash,
    fileReference: doc.fileReference,
    thumbSize: "",
  });
  return { info, location, dcId: doc.dcId };
}

/** Classify `message.media` and locate its original file, or throw a coded error. */
export function describeMessageMedia(media: Api.TypeMessageMedia | undefined): MediaSource {
  if (!media || media instanceof Api.MessageMediaEmpty) {
    throw new TelegramMediaError("NO_MEDIA", "The message has no media.");
  }
  if (media instanceof Api.MessageMediaPhoto) return photoSource(media.photo);
  if (media instanceof Api.MessageMediaDocument) return documentSource(media.document);
  if (media instanceof Api.MessageMediaWebPage && media.webpage instanceof Api.WebPage) {
    if (media.webpage.document) return documentSource(media.webpage.document);
    if (media.webpage.photo) return photoSource(media.webpage.photo);
  }
  throw notDownloadable(media);
}

// ─── Error mapping ───────────────────────────────────────────────────────────

/** Map a GramJS / Telegram error raised while moving file bytes to a coded error. */
export function mapMediaError(e: unknown, direction: "download" | "upload" = "download"): Error {
  const mapped = mapMediaErrorInner(e, direction);
  // Keep the Telegram error as `cause`: callers that must act on its exact type (e.g.
  // a revoked session) can inspect it instead of parsing our message text.
  if (mapped !== e && mapped.cause === undefined) mapped.cause = e;
  return mapped;
}

function mapMediaErrorInner(e: unknown, direction: "download" | "upload"): Error {
  if (isTelegramMediaError(e)) return e;
  if (!(e instanceof Error)) return new Error(String(e));
  if (e.name === "AbortError" || e.name === "TimeoutError") return e;
  const rpc = (e as { errorMessage?: unknown }).errorMessage;
  const seconds = (e as { seconds?: unknown }).seconds;
  const what = direction === "download" ? "download" : "upload";
  const raw = `${e.constructor?.name ?? "Error"}: ${e.message}`;
  if (typeof seconds === "number" && (rpc === "FLOOD" || /FLOOD/.test(String(rpc)))) {
    return new TelegramMediaError("RATE_LIMITED", `Telegram asked to wait ${seconds}s before the next ${what}.`, {
      retryable: true,
      retryAfterMs: seconds * 1000,
    });
  }
  if (typeof rpc === "string") {
    if (rpc.startsWith("FILE_REFERENCE_")) {
      return new TelegramMediaError(
        "FILE_REFERENCE_EXPIRED",
        "Telegram rejected the file reference even after reloading the message. The media was probably deleted or replaced.",
      );
    }
    if (["FILE_ID_INVALID", "LOCATION_INVALID", "MEDIA_EMPTY", "FILE_EMPTY"].includes(rpc)) {
      return new TelegramMediaError("MEDIA_UNAVAILABLE", `Telegram no longer serves this file (${rpc}).`);
    }
    if (["LIMIT_INVALID", "OFFSET_INVALID"].includes(rpc)) {
      return new TelegramMediaError("INVALID_RANGE", `Telegram rejected the byte range (${rpc}).`);
    }
    if (rpc === "TIMEOUT" || /^-?5\d\d$/.test(String((e as { code?: unknown }).code))) {
      const code = direction === "upload" ? "UPLOAD_FAILED" : "DOWNLOAD_FAILED";
      return new TelegramMediaError(code, `Telegram timed out during the ${what} (${rpc}).`, {
        retryable: true,
        retryAfterMs: 3000,
      });
    }
    if (direction === "upload") {
      return new TelegramMediaError("UPLOAD_FAILED", `Telegram rejected the upload (${rpc}).`);
    }
    return new TelegramMediaError("DOWNLOAD_FAILED", `Telegram refused the download: ${raw}`);
  }
  if (e.message === "not implemented") {
    return new TelegramMediaError(
      "MEDIA_NOT_DOWNLOADABLE",
      "This media type (a contact card or web document) has no file to download.",
    );
  }
  return e;
}

// ─── Downloads ───────────────────────────────────────────────────────────────

/** Split [offset, offset+length) into GetFile requests that satisfy Telegram's alignment rules. */
export function planRangeRequests(offset: number, length: number): Array<{ offset: number; limit: number }> {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0) {
    throw new TelegramMediaError("INVALID_RANGE", "offset and length must be non-negative integers.");
  }
  const end = offset + length;
  const requests: Array<{ offset: number; limit: number }> = [];
  let pos = offset - (offset % MIN_ALIGN);
  while (pos < end) {
    let limit = DOWNLOAD_REQUEST_BYTES;
    // Aligned to its own size, a power-of-two limit never crosses a 1 MiB boundary.
    while (limit > MIN_ALIGN && pos % limit !== 0) limit /= 2;
    // Don't over-fetch: shrink while half the window still covers the rest.
    while (limit > MIN_ALIGN && limit / 2 >= end - pos) limit /= 2;
    requests.push({ offset: pos, limit });
    pos += limit;
  }
  return requests;
}

type FileClient = Pick<TelegramClient, "getSender" | "invokeWithSender">;

function newDcOf(e: unknown): number | undefined {
  const dc = (e as { newDc?: unknown } | null)?.newDc;
  if (typeof dc === "number" && dc > 0) {
    const rpc = String((e as { errorMessage?: unknown }).errorMessage ?? "");
    const ctor = (e as { constructor?: { name?: string } }).constructor?.name ?? "";
    if (ctor === "FileMigrateError" || rpc.startsWith("FILE_MIGRATE") || /stored in DC/.test(rpc)) return dc;
  }
  return undefined;
}

/**
 * Reads byte ranges of one message's media. Follows FILE_MIGRATE to the file's DC and
 * reloads the message once when the file reference expired.
 */
export class MediaReader {
  private dcId: number;
  /** File-reference refreshes done; one is allowed per reader. */
  private refreshes = 0;
  /** In-flight refresh, shared by every request that hit the same expired reference. */
  private refreshing: Promise<void> | undefined;

  constructor(
    private readonly client: FileClient,
    private source: MediaSource,
    private readonly reload: () => Promise<MediaSource>,
  ) {
    this.dcId = source.dcId;
  }

  get info(): MediaInfo {
    return { ...this.source.info };
  }

  private async request(offset: number, limit: number, signal?: AbortSignal): Promise<Buffer> {
    let migrations = 0;
    let timedOut = false;
    for (;;) {
      signal?.throwIfAborted();
      const used = this.source;
      try {
        // Ask GramJS for the sender every time: it disconnects idle exported senders
        // (~30 s), so a cached one fails after a pause. getSender reuses a live one.
        const sender = await this.client.getSender(this.dcId);
        const result = await this.client.invokeWithSender(
          new Api.upload.GetFile({ location: this.source.location, offset: bigInt(offset), limit }),
          sender,
        );
        // The request can't be cancelled, but its bytes must not outlive an abort.
        signal?.throwIfAborted();
        if (!(result instanceof Api.upload.File)) {
          throw new TelegramMediaError(
            "DOWNLOAD_FAILED",
            "Telegram redirected this file to a CDN, which is not supported.",
          );
        }
        return Buffer.from(result.bytes);
      } catch (e) {
        const dc = newDcOf(e);
        if (dc !== undefined && migrations < MAX_DC_MIGRATIONS) {
          migrations++;
          this.dcId = dc;
          continue;
        }
        const rpc = String((e as { errorMessage?: unknown } | null)?.errorMessage ?? "");
        if (rpc.startsWith("FILE_REFERENCE_")) {
          // Another request already refreshed since this one started: retry with it.
          if (this.source !== used) continue;
          if (!this.refreshing && this.refreshes === 0) this.refreshing = this.refresh();
          if (this.refreshing) {
            await this.refreshing;
            signal?.throwIfAborted();
            continue;
          }
        }
        if (rpc === "TIMEOUT" && !timedOut) {
          timedOut = true;
          continue;
        }
        throw mapMediaError(e);
      }
    }
  }

  /** Reload the message once for a fresh file reference, refusing a different file. */
  private async refresh(): Promise<void> {
    try {
      const fresh = await this.reload();
      // A new reference for a different file would splice two files into one stream.
      if (fresh.info.fileId !== this.source.info.fileId) {
        throw new TelegramMediaError(
          "MEDIA_CHANGED",
          "The message's media was replaced during the download. Request the file again.",
        );
      }
      this.source = fresh;
      this.refreshes++;
    } finally {
      this.refreshing = undefined;
    }
  }

  /** Read up to `length` bytes at `offset`; shorter only at end of file. */
  async readRange(offset: number, length: number, signal?: AbortSignal): Promise<Buffer> {
    const size = this.source.info.size;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0) {
      throw new TelegramMediaError("INVALID_RANGE", "offset and length must be non-negative integers.");
    }
    signal?.throwIfAborted();
    if (offset >= size || length === 0) return Buffer.alloc(0);
    const want = Math.min(length, size - offset);
    if (this.source.cached) return this.source.cached.subarray(offset, offset + want);
    const parts: Buffer[] = [];
    const plan = planRangeRequests(offset, want);
    const start = plan[0]?.offset ?? offset;
    for (const req of plan) {
      const bytes = await this.request(req.offset, req.limit, signal);
      checkShortRead(bytes.length, req.offset, req.limit, size);
      parts.push(bytes);
      if (bytes.length < req.limit) break; // end of file
    }
    const joined = Buffer.concat(parts);
    return joined.subarray(offset - start, offset - start + want);
  }

  /** Yield the file from `offset` to the end in chunks of at most 512 KiB. */
  async *stream(offset = 0, signal?: AbortSignal): AsyncGenerator<Buffer> {
    const size = this.source.info.size;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new TelegramMediaError("INVALID_RANGE", "offset must be a non-negative integer.");
    }
    signal?.throwIfAborted();
    if (this.source.cached) {
      if (offset < size) yield this.source.cached.subarray(offset);
      return;
    }
    let pos = offset - (offset % MIN_ALIGN);
    let skip = offset - pos;
    while (pos < size) {
      let limit = DOWNLOAD_REQUEST_BYTES;
      while (limit > MIN_ALIGN && pos % limit !== 0) limit /= 2;
      const bytes = await this.request(pos, limit, signal);
      checkShortRead(bytes.length, pos, limit, size);
      const usable = bytes.subarray(skip, Math.max(skip, Math.min(bytes.length, size - pos)));
      skip = 0;
      if (usable.length > 0) yield usable;
      if (bytes.length < limit) return;
      pos += limit;
    }
  }
}

/** A short answer is end of file only where the known size says the file ends. */
function checkShortRead(got: number, offset: number, limit: number, size: number): void {
  if (got < limit && offset + got < size) {
    throw new TelegramMediaError(
      "DOWNLOAD_FAILED",
      `Telegram returned ${got} bytes at offset ${offset}, but the file is ${size} bytes. Retry.`,
      { retryable: true, retryAfterMs: 3000 },
    );
  }
}

/** Write all of `chunk`; a single write may store fewer bytes than asked. */
export async function writeAll(
  write: (buffer: Buffer, offset: number, length: number) => Promise<{ bytesWritten: number }>,
  chunk: Buffer,
): Promise<void> {
  let offset = 0;
  while (offset < chunk.length) {
    const { bytesWritten } = await write(chunk, offset, chunk.length - offset);
    if (bytesWritten <= 0) throw new Error("Disk write made no progress");
    offset += bytesWritten;
  }
}

// ─── Uploads ─────────────────────────────────────────────────────────────────

const FTYP_AUDIO = new Set(["M4A ", "M4B ", "M4P "]);
const FTYP_HEIC = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx"]);
const FTYP_AVIF = new Set(["avif", "avis"]);
const FTYP_VIDEO = new Set([
  "isom",
  "iso2",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "dash",
  "M4V ",
  "MSNV",
  "f4v ",
]);
/** Brands that only say "ISO media / HEIF container" and need the compatible list. */
const FTYP_GENERIC = new Set(["isom", "iso2", "mif1", "msf1"]);

function brandMime(brand: string): string | undefined {
  if (FTYP_AUDIO.has(brand)) return "audio/mp4";
  if (FTYP_HEIC.has(brand)) return "image/heic";
  if (FTYP_AVIF.has(brand)) return "image/avif";
  if (brand === "qt  ") return "video/quicktime";
  if (FTYP_VIDEO.has(brand) || brand.startsWith("3gp")) return "video/mp4";
  return undefined;
}

/**
 * Classify an ISO-BMFF file by its `ftyp` box: the major brand, then compatible
 * brands when the major one is generic. Undefined when unsure, so callers fall
 * back to the declared name or MIME instead of guessing "video".
 */
function ftypMimeType(b: Uint8Array): string | undefined {
  const ascii = (from: number) => String.fromCharCode(...b.subarray(from, from + 4));
  const boxSize = ((b[0] ?? 0) << 24) | ((b[1] ?? 0) << 16) | ((b[2] ?? 0) << 8) | (b[3] ?? 0);
  const end = Math.min(b.length, Math.max(boxSize, 16));
  const major = ascii(8);
  const compatible: string[] = [];
  for (let i = 16; i + 4 <= end; i += 4) compatible.push(ascii(i));
  if (!FTYP_GENERIC.has(major)) return brandMime(major);
  // Specific compatible brands win over generic ones (an AVIF lists mif1 and avif).
  const specific = compatible.map(brandMime).find((m) => m && m !== "video/mp4");
  if (specific) return specific;
  if (major === "mif1" || major === "msf1") return undefined;
  return compatible.some((c) => brandMime(c) === "video/mp4") || FTYP_VIDEO.has(major) ? "video/mp4" : undefined;
}

/** MIME of common media formats from their first bytes. */
export function sniffMimeType(head: Uint8Array): string | undefined {
  const b = head;
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 4 && b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (b.length >= 4 && ascii(0, 4) === "GIF8") return "image/gif";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (b.length >= 12 && ascii(4, 8) === "ftyp") return ftypMimeType(b);
  if (b.length >= 4 && ascii(0, 4) === "OggS") return "audio/ogg";
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  if (b.length >= 4 && ascii(0, 4) === "%PDF") return "application/pdf";
  return undefined;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/mp4": "m4a",
  "image/heic": "heic",
  "image/avif": "avif",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
};

/** Extension of a file name, lower-case without the dot, or "" when there is none. */
function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** `name` with `ext` appended unless it already ends with one of `accepted`. */
export function ensureExtension(name: string, ext: string, accepted: readonly string[] = [ext]): string {
  return accepted.includes(extensionOf(name)) ? name : `${name}.${ext}`;
}

/** File name with an extension: the given one, or one derived from the sniffed MIME. */
export function nameWithSniffedExtension(file: UploadedFile): string {
  if (extensionOf(file.fileName)) return file.fileName;
  const ext = file.mimeType ? EXT_BY_MIME[file.mimeType] : undefined;
  return ext ? `${file.fileName}.${ext}` : file.fileName;
}

const PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

/** Name Telegram accepts for a photo upload; without an image extension it fails with PHOTO_EXT_INVALID. */
export function photoFileName(name: string, mimeType?: string): string {
  const sniffed = mimeType ? EXT_BY_MIME[mimeType] : undefined;
  const ext = sniffed && (PHOTO_EXTENSIONS as readonly string[]).includes(sniffed) ? sniffed : "jpg";
  return ensureExtension(name, ext, PHOTO_EXTENSIONS);
}

/** Same uploaded bytes under another name; Telegram derives MIME and attributes from it. */
export function renamedInputFile(file: UploadedFile, name: string): Api.InputFile | Api.InputFileBig {
  const f = file.inputFile;
  return f instanceof Api.InputFileBig
    ? new Api.InputFileBig({ id: f.id, parts: f.parts, name })
    : new Api.InputFile({ id: f.id, parts: f.parts, name, md5Checksum: f.md5Checksum });
}

function safeUploadName(fileName: string): string {
  const base = [...(fileName.split(/[\\/]/).pop() ?? "")]
    .filter((ch) => ch.charCodeAt(0) > 0x1f && ch.charCodeAt(0) !== 0x7f)
    .join("")
    .trim();
  return base.slice(0, 255) || "file";
}

type UploadClient = Pick<TelegramClient, "invoke">;

/**
 * Upload `size` bytes from `source` straight to Telegram, 512 KiB per part, up to
 * {@link UPLOAD_CONCURRENCY} parts in flight. Fails if the source yields more or
 * fewer bytes than declared. Nothing is written to disk.
 */
export async function uploadStream(
  client: UploadClient,
  source: AsyncIterable<Uint8Array>,
  size: number,
  fileName: string,
  signal?: AbortSignal,
): Promise<UploadedFile> {
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new TelegramMediaError("UPLOAD_SIZE_MISMATCH", "File size must be a positive integer.");
  }
  if (size > TELEGRAM_MAX_FILE_BYTES) {
    throw new TelegramMediaError(
      "MEDIA_TOO_LARGE",
      `File is ${size} bytes; Telegram accepts at most ${TELEGRAM_MAX_FILE_BYTES} bytes.`,
    );
  }
  const name = safeUploadName(fileName);
  const isBig = size > BIG_FILE_THRESHOLD_BYTES;
  const totalParts = Math.ceil(size / UPLOAD_PART_BYTES);
  const fileId = generateRandomBigInt();
  const inFlight = new Set<Promise<void>>();
  let failure: unknown;
  let partIndex = 0;
  let received = 0;
  let head = Buffer.alloc(0);
  let pending: Buffer[] = [];
  let pendingBytes = 0;
  // Fires on abort or on the first failed part, so a stalled source or Telegram call can't
  // keep the upload waiting: every await below races against it. Each wait removes its own
  // listener when it settles; a shared pending promise would keep every awaited chunk alive.
  const stop = new AbortController();
  const interrupt = (reason: unknown) => stop.abort(reason);
  const race = <T>(p: Promise<T>): Promise<T> => {
    if (stop.signal.aborted) return Promise.reject(stop.signal.reason);
    return new Promise<T>((resolve, reject) => {
      const onStop = () => reject(stop.signal.reason);
      stop.signal.addEventListener("abort", onStop, { once: true });
      p.then(
        (value) => {
          stop.signal.removeEventListener("abort", onStop);
          resolve(value);
        },
        (error) => {
          stop.signal.removeEventListener("abort", onStop);
          reject(error);
        },
      );
    });
  };
  const onAbort = () => interrupt(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });

  const sendPart = async (bytes: Buffer): Promise<void> => {
    const filePart = partIndex++;
    const request = isBig
      ? new Api.upload.SaveBigFilePart({ fileId, filePart, fileTotalParts: totalParts, bytes })
      : new Api.upload.SaveFilePart({ fileId, filePart, bytes });
    const task = client
      .invoke(request)
      .then((ok) => {
        if (ok !== true) throw new TelegramMediaError("UPLOAD_FAILED", `Telegram did not accept part ${filePart}.`);
      })
      .catch((e) => {
        failure ??= mapMediaError(e, "upload");
        interrupt(failure);
      })
      .finally(() => inFlight.delete(task));
    inFlight.add(task);
    if (inFlight.size >= UPLOAD_CONCURRENCY) await race(Promise.race(inFlight));
  };
  const takePart = (n: number): Buffer => {
    const all = pending.length === 1 ? (pending[0] as Buffer) : Buffer.concat(pending, pendingBytes);
    const part = all.subarray(0, n);
    const rest = all.subarray(n);
    pending = rest.length ? [rest] : [];
    pendingBytes = rest.length;
    return Buffer.from(part);
  };
  const check = (): void => {
    signal?.throwIfAborted();
    if (failure) throw failure;
  };

  const iterator = source[Symbol.asyncIterator]();
  try {
    // Fail fast: a source waiting for its first bytes would otherwise hang.
    check();
    for (;;) {
      const next = await race(iterator.next());
      if (next.done) break;
      const chunk = next.value;
      check();
      if (chunk.byteLength === 0) continue;
      received += chunk.byteLength;
      if (received > size) {
        throw new TelegramMediaError(
          "UPLOAD_SIZE_MISMATCH",
          `Received more bytes than the declared size of ${size}. Declare the exact file size.`,
        );
      }
      // Copy: a source may reuse one Uint8Array for every chunk.
      const buf = Buffer.from(chunk);
      if (head.length < SNIFF_BYTES) head = Buffer.concat([head, buf.subarray(0, SNIFF_BYTES - head.length)]);
      pending.push(buf);
      pendingBytes += buf.length;
      while (pendingBytes >= UPLOAD_PART_BYTES) {
        await sendPart(takePart(UPLOAD_PART_BYTES));
        check();
      }
    }
    check();
    if (received !== size) {
      throw new TelegramMediaError(
        "UPLOAD_SIZE_MISMATCH",
        `Received ${received} bytes but the declared size is ${size}. The transfer was cut short or the size is wrong.`,
      );
    }
    if (pendingBytes > 0) await sendPart(takePart(pendingBytes));
    await race(Promise.all(inFlight));
    check();
  } catch (e) {
    iterator.return?.(undefined)?.catch(() => {});
    // Parts already sent can't be recalled. Wait until Telegram settled them (they never
    // reject, see sendPart), so a caller holding a slot holds it until the work is done;
    // the caller's own deadline is what answers a client in the meantime.
    await Promise.allSettled([...inFlight]);
    throw e;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }

  const inputFile = isBig
    ? new Api.InputFileBig({ id: fileId, parts: totalParts, name })
    : new Api.InputFile({ id: fileId, parts: totalParts, name, md5Checksum: "" });
  const mimeType = sniffMimeType(head);
  return { kind: "uploaded-file", inputFile, fileName: name, size, ...(mimeType && { mimeType }) };
}
