import { Api } from "telegram/tl/index.js";

/** Cap for Instant View text: enough to tell what the page is about, small enough for a message list. */
export const INSTANT_VIEW_TEXT_LIMIT = 1500;
const INSTANT_VIEW_TITLE_LIMIT = 200;
/** Instant View blocks and rich text nest; deeper chains are cut instead of overflowing the stack. */
const MAX_DEPTH = 16;

/**
 * Text of the Instant View page attached to a link preview. It comes from a third-party web page,
 * not from the message author, so callers must keep it apart from the message `text`.
 */
export type InstantViewSummary = { title?: string; text?: string };

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  // Do not split a surrogate pair at the cut.
  let end = limit;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return `${text.slice(0, end).trimEnd()}… [truncated, ${text.length - end} more chars]`;
}

function joinVisibleText(parts: Array<string | undefined>, separator = "\n\n"): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(separator);
}

/** Flatten Telegram rich text while preserving the visible character order. */
function extractRichText(text: Api.TypeRichText | undefined, depth: number): string {
  if (!text || depth > MAX_DEPTH) return "";
  if (text instanceof Api.TextPlain) return text.text;
  if (text instanceof Api.TextConcat) {
    return text.texts.map((part) => extractRichText(part, depth + 1)).join("");
  }
  if ("text" in text) return extractRichText(text.text, depth + 1);
  return "";
}

function extractPageCaption(caption: Api.TypePageCaption | undefined, depth: number): string {
  if (!(caption instanceof Api.PageCaption)) return "";
  return joinVisibleText([extractRichText(caption.text, depth + 1), extractRichText(caption.credit, depth + 1)]);
}

function extractPageBlocks(blocks: Api.TypePageBlock[], depth: number): string {
  if (depth > MAX_DEPTH) return "";
  return joinVisibleText(blocks.map((block) => extractPageBlock(block, depth + 1)));
}

/** Flatten the content Telegram renders in an Instant View page block. */
function extractPageBlock(block: Api.TypePageBlock, depth: number): string {
  if (depth > MAX_DEPTH) return "";
  const next = depth + 1;

  if (block instanceof Api.PageBlockList) {
    return block.items
      .map((item) => {
        const text =
          item instanceof Api.PageListItemText
            ? extractRichText(item.text, next)
            : item instanceof Api.PageListItemBlocks
              ? extractPageBlocks(item.blocks, next)
              : "";
        return text ? `• ${text}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (block instanceof Api.PageBlockOrderedList) {
    return block.items
      .map((item) => {
        const text =
          item instanceof Api.PageListOrderedItemText
            ? extractRichText(item.text, next)
            : item instanceof Api.PageListOrderedItemBlocks
              ? extractPageBlocks(item.blocks, next)
              : "";
        return text ? `${item.num} ${text}`.trim() : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  if (block instanceof Api.PageBlockBlockquote || block instanceof Api.PageBlockPullquote) {
    return joinVisibleText([extractRichText(block.text, next), extractRichText(block.caption, next)]);
  }

  if (block instanceof Api.PageBlockAuthorDate) return extractRichText(block.author, next);
  if (block instanceof Api.PageBlockCover) return extractPageBlock(block.cover, next);

  if (block instanceof Api.PageBlockEmbedPost) {
    return joinVisibleText([
      block.author,
      extractPageBlocks(block.blocks, next),
      extractPageCaption(block.caption, next),
    ]);
  }

  if (block instanceof Api.PageBlockCollage || block instanceof Api.PageBlockSlideshow) {
    return joinVisibleText([extractPageBlocks(block.items, next), extractPageCaption(block.caption, next)]);
  }

  if (block instanceof Api.PageBlockTable) {
    const rows = block.rows
      .map((row) =>
        row.cells
          .map((cell) => (cell.text ? extractRichText(cell.text, next) : ""))
          .filter(Boolean)
          .join("\t"),
      )
      .filter(Boolean)
      .join("\n");
    return joinVisibleText([extractRichText(block.title, next), rows]);
  }

  if (block instanceof Api.PageBlockDetails) {
    return joinVisibleText([extractRichText(block.title, next), extractPageBlocks(block.blocks, next)]);
  }

  if (block instanceof Api.PageBlockRelatedArticles) {
    const articles = block.articles
      .map((article) => joinVisibleText([article.title, article.description, article.author], " — "))
      .filter(Boolean)
      .join("\n");
    return joinVisibleText([extractRichText(block.title, next), articles]);
  }

  if (
    block instanceof Api.PageBlockPhoto ||
    block instanceof Api.PageBlockVideo ||
    block instanceof Api.PageBlockEmbed ||
    block instanceof Api.PageBlockAudio ||
    block instanceof Api.PageBlockMap
  ) {
    return extractPageCaption(block.caption, next);
  }

  if ("text" in block) return extractRichText(block.text, next);
  return "";
}

/**
 * Title and capped text of the Instant View page behind a link preview.
 * Returns undefined for plain link previews: their title/description are not message content.
 */
export function summarizeInstantView(media: Api.TypeMessageMedia | undefined): InstantViewSummary | undefined {
  if (!(media instanceof Api.MessageMediaWebPage) || !(media.webpage instanceof Api.WebPage)) return undefined;
  const page = media.webpage.cachedPage;
  if (!(page instanceof Api.Page)) return undefined;

  const text = extractPageBlocks(page.blocks, 0);
  const title = media.webpage.title?.trim();
  if (!text && !title) return undefined;

  const summary: InstantViewSummary = {};
  if (title) summary.title = truncate(title, INSTANT_VIEW_TITLE_LIMIT);
  if (text) summary.text = truncate(text, INSTANT_VIEW_TEXT_LIMIT);
  return summary;
}
