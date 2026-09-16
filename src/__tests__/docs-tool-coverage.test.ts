import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getToolManifest } from "../manifest.js";

/**
 * Docs parity gate.
 *
 * Every PR that adds a tool has to touch four places outside `src/`: the
 * VitePress `TOOL_COUNT` constant and one row + one headline count in each of
 * the three locale reference pages. Contributors miss them (and so do we), and
 * nothing used to fail: `manifest.test.ts` only asserts a `>= 150` floor, so
 * the catalog silently drifts away from the published docs.
 *
 * These tests fail loudly instead, naming the exact file and the exact tool.
 */

const repoFile = (relative: string) => fileURLToPath(new URL(`../../${relative}`, import.meta.url));
const read = (relative: string) => readFileSync(repoFile(relative), "utf8");

const VITEPRESS_CONFIG = "docs/.vitepress/config.ts";

/** Locale reference pages, with the headline sentence that carries the count. */
const REFERENCE_PAGES = [
  { path: "docs/tools/reference.md", locale: "en" },
  { path: "docs/ru/tools/reference.md", locale: "ru" },
  { path: "docs/zh/tools/reference.md", locale: "zh" },
] as const;

describe("docs cover the tool catalog", () => {
  const manifest = getToolManifest();

  it("VitePress TOOL_COUNT matches the registered catalog", () => {
    const source = read(VITEPRESS_CONFIG);
    const match = source.match(/const TOOL_COUNT = (\d+);/);
    assert.ok(match, `could not find "const TOOL_COUNT = <n>;" in ${VITEPRESS_CONFIG}`);

    assert.strictEqual(
      Number(match[1]),
      manifest.toolCount,
      `${VITEPRESS_CONFIG} says ${match[1]} tools, the server registers ${manifest.toolCount}. ` +
        "Update TOOL_COUNT (it feeds the nav label and the SEO description in all three locales).",
    );
  });

  for (const { path, locale } of REFERENCE_PAGES) {
    it(`${locale} reference page states the right tool count`, () => {
      // The headline is the first sentence and reads "... 181 tools ..." /
      // "... 181 инструмент ..." / "... 181 个工具 ...". Match the digits only,
      // so translators stay free to reword (and to fix numeral agreement —
      // Russian needs "181 инструмент" but "182 инструмента").
      const headline = read(path).split("\n", 5).join("\n");
      const match = headline.match(/\b(\d{2,4})\b/);
      assert.ok(match, `no tool count found in the opening lines of ${path}`);

      assert.strictEqual(
        Number(match[1]),
        manifest.toolCount,
        `${path} states ${match[1]} tools, the server registers ${manifest.toolCount}.`,
      );
    });

    it(`${locale} reference page documents every registered tool`, () => {
      const page = read(path);
      const missing = manifest.tools.map((t) => t.name).filter((name) => !page.includes(`\`${name}\``));

      assert.deepStrictEqual(
        missing,
        [],
        `${path} is missing ${missing.length} tool(s): ${missing.join(", ")}. ` +
          "Every registered tool needs a row in all three locales.",
      );
    });
  }
});
