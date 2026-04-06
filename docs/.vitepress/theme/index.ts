import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import VersionBadge from "./VersionBadge.vue";

export default {
	extends: DefaultTheme,
	enhanceApp({ app }) {
		app.component("VersionBadge", VersionBadge);
	},
} satisfies Theme;
