import { defineConfig } from "vitepress";

export default defineConfig({
  title: "MCP Telegram",
  description: "Connect AI assistants to Telegram — 59 tools via MTProto protocol",
  base: "/mcp-telegram/",
  head: [
    [
      "link",
      {
        rel: "icon",
        href: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>✈️</text></svg>",
      },
    ],
  ],
  themeConfig: {
    logo: "https://raw.githubusercontent.com/nicedoc/gramjs/master/gramjs.png",
    nav: [
      { text: "Guide", link: "/getting-started/credentials" },
      { text: "Platforms", link: "/platforms/claude-desktop" },
      { text: "Tools", link: "/tools/reference" },
      {
        text: "Cloud",
        link: "https://mcp-telegram.com",
      },
    ],
    sidebar: [
      {
        text: "Getting Started",
        items: [
          {
            text: "Get API Credentials",
            link: "/getting-started/credentials",
          },
          {
            text: "Installation",
            link: "/getting-started/installation",
          },
          { text: "Login", link: "/getting-started/login" },
        ],
      },
      {
        text: "Platforms",
        items: [
          { text: "Claude Desktop", link: "/platforms/claude-desktop" },
          { text: "Claude Code", link: "/platforms/claude-code" },
          { text: "Cursor / VS Code", link: "/platforms/cursor" },
          { text: "ChatGPT", link: "/platforms/chatgpt" },
          { text: "Mastra", link: "/platforms/mastra" },
        ],
      },
      {
        text: "Guides",
        items: [
          {
            text: "Summarize Unread Messages",
            link: "/guides/read-unread",
          },
          { text: "Search Messages", link: "/guides/search-messages" },
          { text: "Manage Groups", link: "/guides/manage-groups" },
          { text: "Stickers", link: "/guides/stickers" },
          {
            text: "Multiple Accounts",
            link: "/guides/multiple-accounts",
          },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "All Tools (59)", link: "/tools/reference" },
          { text: "Troubleshooting", link: "/troubleshooting" },
          { text: "FAQ", link: "/faq" },
        ],
      },
    ],
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/overpod/mcp-telegram",
      },
      { icon: "npm", link: "https://www.npmjs.com/package/@overpod/mcp-telegram" },
    ],
    editLink: {
      pattern: "https://github.com/overpod/mcp-telegram/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    search: {
      provider: "local",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "© 2025 overpod",
    },
  },
});
