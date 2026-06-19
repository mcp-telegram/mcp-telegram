/**
 * Generates the VitePress changelog pages from the single source of truth,
 * CHANGELOG.md (maintained by release-please).
 *
 * Writes docs/changelog.md (English) plus localized docs/ru/changelog.md and
 * docs/zh/changelog.md — header/intro are localized, version entries stay in
 * English (CHANGELOG.md is English-only; freshness beats partial translation).
 *
 * Run with no args to write the files; pass --check to fail (exit 1) when the
 * generated output differs from what's on disk — used in CI to catch a stale
 * commit. Invoked from prebuild of the docs (`predocs:build`).
 *
 * No external deps: runs under tsx (dev) and `node` (CI) against the repo root.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

interface Entry {
  version: string;
  date: string;
  /** Section name (Added/Fixed/Changed/...) → list of cleaned bullet lines. */
  sections: Map<string, string[]>;
}

/** Strip release-please's inline commit/PR links, leaving human-readable prose. */
function cleanLine(line: string): string {
  return (
    line
      // normalize bullet marker `* ` → `- ` (release-please uses `*`, docs use `-`)
      .replace(/^(\s*)\*\s+/, "$1- ")
      // ([abc1234](https://github.com/.../commit/...)) — drop entirely
      .replace(/\s*\(\[[0-9a-f]{6,}\]\([^)]*\)\)/g, "")
      // ([#49](https://github.com/.../issues/49)) → (#49)
      .replace(/\(\[(#\d+)\]\([^)]*\)\)/g, "($1)")
      // bare [text](url) commit/issue refs left over → text
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]*)\)/g, "$1")
      .trimEnd()
  );
}

/** Conventional-commit scopes that carry no user-facing signal. */
const NOISE_SCOPE = /^\s*-\s+\*\*(deps|build|ci|chore|docs|test|style|refactor)(\([^)]*\))?:\*\*/i;

/** A single bullet is noise if it's a noise-scoped commit or a plain deps bump.
 * Deps wording (e.g. "Dependency update", "bump … → …") is reliable noise; a
 * bare tool name like "biome"/"tsx" is NOT — it appears in real refactor notes
 * ("eliminates 2 Biome false-positives"), so we only treat it as a bump when a
 * version arrow accompanies it. */
function isNoiseBullet(line: string): boolean {
  if (NOISE_SCOPE.test(line)) return true;
  if (/^\s*-\s+.*\b(dependenc|devdep|lockfile|npm audit)/i.test(line)) return true;
  // "bump X → Y" / "X 1.2.3 → 1.2.4" style version bumps
  return /^\s*-\s+.*\bbump\b/i.test(line) && /[→]|->|\bv?\d+\.\d+\.\d+\b/.test(line);
}

/** Parse CHANGELOG.md into version entries (newest first, as written). */
function parseChangelog(md: string): Entry[] {
  const lines = md.split("\n");
  const entries: Entry[] = [];
  let cur: Entry | null = null;
  let curSection: string | null = null;

  // Matches all three header shapes release-please / hand edits produce.
  // The date is the LAST date token on the line — anchor on $ so the compare
  // URL's embedded version numbers (…compare/v1.37.1...v1.38.0…) can't be
  // mistaken for it:
  //   ## [1.38.1](https://…compare…) (2026-06-10)
  //   ## [1.37.0] — 2026-06-04
  //   ## [1.23.0] - 2026-04-05
  const header = /^##\s+\[(\d+\.\d+\.\d+)\].*?(\d{4}-\d{2}-\d{2})\)?\s*$/;

  for (const raw of lines) {
    const h = raw.match(header);
    if (h) {
      cur = { version: h[1], date: h[2], sections: new Map() };
      entries.push(cur);
      curSection = null;
      continue;
    }
    if (!cur) continue;

    const sec = raw.match(/^###\s+(.+?)\s*$/);
    if (sec) {
      curSection = sec[1];
      if (!cur.sections.has(curSection)) cur.sections.set(curSection, []);
      continue;
    }

    // Bullet line (top-level or nested) under the current section.
    if (/^\s*[-*]\s+/.test(raw) && curSection) {
      cur.sections.get(curSection)?.push(cleanLine(raw));
    } else if (raw.trim() && curSection && /^\s{2,}/.test(raw)) {
      // continuation / nested non-bullet line — keep as-is (cleaned)
      cur.sections.get(curSection)?.push(cleanLine(raw));
    }
  }
  return entries;
}

/** Sections that carry no user-facing signal — dropped from mixed releases. */
const NOISE_SECTIONS = new Set(["Documentation", "Build", "CI", "Chores", "Miscellaneous Chores"]);

/** Non-noise bullets in a section, keyed by section name. Empty → nothing to show. */
function signalSections(e: Entry): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [name, items] of e.sections) {
    if (NOISE_SECTIONS.has(name)) continue;
    const keep = items.filter((i) => i.trim() && !isNoiseBullet(i));
    if (keep.length > 0) out.set(name, keep);
  }
  return out;
}

/** A version is "noise-only" if no section has any user-facing bullet left. */
function isNoiseOnly(e: Entry): boolean {
  return signalSections(e).size === 0;
}

function anchor(version: string): string {
  return `v${version.replace(/\./g, "-")}`;
}

function renderEntry(e: Entry, latest: boolean): string {
  const badge = latest ? ' <Badge type="tip" text="latest" />' : "";
  const out: string[] = [`## ${e.version} — ${e.date}${badge} {#${anchor(e.version)}}`, ""];

  if (isNoiseOnly(e)) {
    // Collapse pure deps/ci/docs releases into a single neutral line.
    out.push(
      "### Changed",
      "",
      "- Internal maintenance: dependency, build, or documentation updates only (no user-facing changes).",
      "",
    );
    return out.join("\n");
  }

  // Mixed release: emit only sections with user-facing bullets (noise filtered out).
  for (const [name, items] of signalSections(e)) {
    out.push(`### ${name}`, "");
    for (const i of items) out.push(i);
    out.push("");
  }
  return out.join("\n");
}

interface Locale {
  /** Output path relative to repo root. */
  path: string;
  title: string;
  currentLabel: string;
  intro: string;
}

const LOCALES: Locale[] = [
  {
    path: "docs/changelog.md",
    title: "Changelog",
    currentLabel: "Current version",
    intro:
      "All notable changes to MCP Telegram. For the full diff between versions, see [GitHub Releases](https://github.com/mcp-telegram/mcp-telegram/releases).",
  },
  {
    path: "docs/ru/changelog.md",
    title: "Список изменений",
    currentLabel: "Текущая версия",
    intro:
      "Все заметные изменения в MCP Telegram. Полное сравнение версий — на [GitHub Releases](https://github.com/mcp-telegram/mcp-telegram/releases). Записи приведены на английском (как в исходном CHANGELOG).",
  },
  {
    path: "docs/zh/changelog.md",
    title: "更新日志",
    currentLabel: "当前版本",
    intro:
      "MCP Telegram 的所有重要更改。完整版本对比见 [GitHub Releases](https://github.com/mcp-telegram/mcp-telegram/releases)。条目以英文显示（与源 CHANGELOG 一致）。",
  },
];

function renderPage(loc: Locale, entries: Entry[], pkgVersion: string): string {
  const body = entries.map((e, idx) => renderEntry(e, idx === 0)).join("\n");
  return [
    `# ${loc.title}`,
    "",
    `<VersionBadge version="${pkgVersion}" /> ${loc.currentLabel}`,
    "",
    loc.intro,
    "",
    "<!-- Generated from CHANGELOG.md by scripts/gen-changelog-docs.ts. Do not edit by hand. -->",
    "",
    body.trimEnd(),
    "",
  ].join("\n");
}

function main() {
  const check = process.argv.includes("--check");
  const changelog = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
  const entries = parseChangelog(changelog);

  if (entries.length === 0) {
    console.error("gen-changelog-docs: parsed 0 versions from CHANGELOG.md — refusing to write empty pages.");
    process.exit(1);
  }

  let drift = false;
  for (const loc of LOCALES) {
    const next = renderPage(loc, entries, pkg.version);
    const abs = join(ROOT, loc.path);
    const prev = (() => {
      try {
        return readFileSync(abs, "utf8");
      } catch {
        return "";
      }
    })();
    if (next !== prev) {
      drift = true;
      if (check) {
        console.error(`gen-changelog-docs: ${loc.path} is stale. Run \`npm run gen:changelog\` and commit.`);
      } else {
        writeFileSync(abs, next);
        console.log(`gen-changelog-docs: wrote ${loc.path} (${entries.length} versions)`);
      }
    }
  }

  if (check && drift) process.exit(1);
  if (!check && !drift) console.log("gen-changelog-docs: all changelog pages already up to date.");
}

main();
