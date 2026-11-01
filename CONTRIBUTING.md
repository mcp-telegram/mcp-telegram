# Contributing to mcp-telegram

Thanks for helping. This repository is the MCP server itself: the tools, the MTProto layer, the CLI and the `serve` daemon. Hosting concerns (OAuth, multi-user sessions, the website) live in [mcp-telegram-cloud](https://github.com/mcp-telegram/mcp-telegram-cloud).

Issues and pull requests are welcome in any language. We answer in English, and in Russian if you wrote in Russian.

## Where things are tracked

- **Roadmap and priorities:** the public [mcp-telegram roadmap board](https://github.com/orgs/mcp-telegram/projects/1). Items marked `good first issue` or `help wanted` are open for contributors.
- **Bugs and feature requests:** [issues](https://github.com/mcp-telegram/mcp-telegram/issues/new/choose).
- **Questions and ideas:** [Discussions](https://github.com/mcp-telegram/mcp-telegram/discussions).
- **Security problems:** never in a public issue. See [SECURITY.md](https://github.com/mcp-telegram/.github/blob/main/SECURITY.md).

## Before you start a larger change

Open an issue first and describe the problem. Everything a tool returns goes straight into an LLM's context, so we care a lot about two things that are hard to see from the code:

1. **Bounded output.** A tool must not return an unbounded amount of text. Cap and mark truncation.
2. **Third-party text stays labelled.** Content that someone other than the chat participant wrote (web previews, Instant View pages, bot keyboards) must not look like the user's own message.

Agreeing on the contract first saves a round of review.

## Development

Requirements: Node.js 22 or 24.

```bash
npm ci
npm run build
```

Run these before you push. CI runs the same checks on Ubuntu (Node 22 and 24) and Windows:

```bash
npx tsc --noEmit
npx biome check src/
npm test
```

If you change anything under `docs/`, also run `npm run docs:build`.

Adding or removing a tool? The docs test compares the tool manifest with the tool count and the reference pages in `docs/` (English, Russian, Chinese). Update all of them.

## Commits and releases

We use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`. Releases are cut by release-please from these messages, so the prefix decides whether your change ships in the next version. Please don't bump the version or edit `CHANGELOG.md` by hand.

## Pull requests

- Keep one logical change per PR and link the issue it closes (`Closes #123`).
- Add or update tests for behaviour changes.
- No secrets, session strings or phone numbers in code, tests or screenshots.

By contributing you agree that your work is released under the [MIT License](LICENSE).
