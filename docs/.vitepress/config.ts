import { defineConfig } from "vitepress";

const enNav = [
  { text: "Guide", link: "/getting-started/credentials" },
  { text: "Platforms", link: "/platforms/claude-desktop" },
  { text: "Tools", link: "/tools/reference" },
  { text: "Cloud", link: "https://mcp-telegram.com" },
];

const ruNav = [
  { text: "Руководство", link: "/ru/getting-started/credentials" },
  { text: "Платформы", link: "/ru/platforms/claude-desktop" },
  { text: "Инструменты", link: "/ru/tools/reference" },
  { text: "Облако", link: "https://mcp-telegram.com" },
];

const zhNav = [
  { text: "指南", link: "/zh/getting-started/credentials" },
  { text: "平台", link: "/zh/platforms/claude-desktop" },
  { text: "工具", link: "/zh/tools/reference" },
  { text: "云版本", link: "https://mcp-telegram.com" },
];

const enSidebar = [
  {
    text: "Getting Started",
    items: [
      { text: "Get API Credentials", link: "/getting-started/credentials" },
      { text: "Installation", link: "/getting-started/installation" },
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
      { text: "Summarize Unread Messages", link: "/guides/read-unread" },
      { text: "Search Messages", link: "/guides/search-messages" },
      { text: "Manage Groups", link: "/guides/manage-groups" },
      { text: "Stickers", link: "/guides/stickers" },
      { text: "Multiple Accounts", link: "/guides/multiple-accounts" },
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
];

const ruSidebar = [
  {
    text: "Начало работы",
    items: [
      { text: "Получение API ключей", link: "/ru/getting-started/credentials" },
      { text: "Установка", link: "/ru/getting-started/installation" },
      { text: "Вход", link: "/ru/getting-started/login" },
    ],
  },
  {
    text: "Платформы",
    items: [
      { text: "Claude Desktop", link: "/ru/platforms/claude-desktop" },
      { text: "Claude Code", link: "/ru/platforms/claude-code" },
      { text: "Cursor / VS Code", link: "/ru/platforms/cursor" },
      { text: "ChatGPT", link: "/ru/platforms/chatgpt" },
      { text: "Mastra", link: "/ru/platforms/mastra" },
    ],
  },
  {
    text: "Руководства",
    items: [
      { text: "Непрочитанные сообщения", link: "/ru/guides/read-unread" },
      { text: "Поиск сообщений", link: "/ru/guides/search-messages" },
      { text: "Управление группами", link: "/ru/guides/manage-groups" },
      { text: "Стикеры", link: "/ru/guides/stickers" },
      { text: "Несколько аккаунтов", link: "/ru/guides/multiple-accounts" },
    ],
  },
  {
    text: "Справочник",
    items: [
      { text: "Все инструменты (59)", link: "/ru/tools/reference" },
      { text: "Решение проблем", link: "/ru/troubleshooting" },
      { text: "FAQ", link: "/ru/faq" },
    ],
  },
];

const zhSidebar = [
  {
    text: "快速开始",
    items: [
      { text: "获取 API 凭证", link: "/zh/getting-started/credentials" },
      { text: "安装", link: "/zh/getting-started/installation" },
      { text: "登录", link: "/zh/getting-started/login" },
    ],
  },
  {
    text: "平台",
    items: [
      { text: "Claude Desktop", link: "/zh/platforms/claude-desktop" },
      { text: "Claude Code", link: "/zh/platforms/claude-code" },
      { text: "Cursor / VS Code", link: "/zh/platforms/cursor" },
      { text: "ChatGPT", link: "/zh/platforms/chatgpt" },
      { text: "Mastra", link: "/zh/platforms/mastra" },
    ],
  },
  {
    text: "使用指南",
    items: [
      { text: "汇总未读消息", link: "/zh/guides/read-unread" },
      { text: "搜索消息", link: "/zh/guides/search-messages" },
      { text: "管理群组", link: "/zh/guides/manage-groups" },
      { text: "贴纸", link: "/zh/guides/stickers" },
      { text: "多账户", link: "/zh/guides/multiple-accounts" },
    ],
  },
  {
    text: "参考",
    items: [
      { text: "所有工具 (59)", link: "/zh/tools/reference" },
      { text: "故障排除", link: "/zh/troubleshooting" },
      { text: "常见问题", link: "/zh/faq" },
    ],
  },
];

const base = "/mcp-telegram/";

export default defineConfig({
  title: "MCP Telegram",
  description: "Connect AI assistants to Telegram — 59 tools via MTProto protocol",
  base,
  head: [
    [
      "link",
      {
        rel: "icon",
        href: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>✈️</text></svg>",
      },
    ],
    [
      "script",
      {},
      `
      (function() {
        var base = document.querySelector('base')?.getAttribute('href') || '${base}';
        var stripped = base.replace(/\\/$/, '');
        var path = window.location.pathname;
        if (path.replace(/\\/$/, '') === stripped || path === base) {
          var lang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
          if (lang.startsWith('ru')) {
            window.location.replace(base + 'ru/');
          } else if (lang.startsWith('zh')) {
            window.location.replace(base + 'zh/');
          }
        }
      })();
      `,
    ],
  ],
  locales: {
    root: {
      label: "English",
      lang: "en",
      themeConfig: {
        nav: enNav,
        sidebar: enSidebar,
      },
    },
    ru: {
      label: "Русский",
      lang: "ru",
      themeConfig: {
        nav: ruNav,
        sidebar: ruSidebar,
        outlineTitle: "На этой странице",
        lastUpdatedText: "Обновлено",
        docFooter: { prev: "Назад", next: "Далее" },
        editLink: {
          pattern: "https://github.com/overpod/mcp-telegram/edit/main/docs/:path",
          text: "Редактировать на GitHub",
        },
      },
    },
    zh: {
      label: "中文",
      lang: "zh-CN",
      themeConfig: {
        nav: zhNav,
        sidebar: zhSidebar,
        outlineTitle: "本页目录",
        lastUpdatedText: "最后更新",
        docFooter: { prev: "上一页", next: "下一页" },
        editLink: {
          pattern: "https://github.com/overpod/mcp-telegram/edit/main/docs/:path",
          text: "在 GitHub 上编辑",
        },
      },
    },
  },
  themeConfig: {
    logo: "https://raw.githubusercontent.com/nicedoc/gramjs/master/gramjs.png",
    socialLinks: [
      { icon: "github", link: "https://github.com/overpod/mcp-telegram" },
      {
        icon: "npm",
        link: "https://www.npmjs.com/package/@overpod/mcp-telegram",
      },
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
