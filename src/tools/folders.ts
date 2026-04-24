import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TelegramService } from "../telegram-client.js";
import { fail, ok, READ_ONLY, requireConnection, WRITE } from "./shared.js";

export function registerFolderTools(server: McpServer, telegram: TelegramService) {
  server.registerTool(
    "telegram-create-folder",
    {
      description:
        "Create a new Telegram chat folder (filter). Returns the new folder ID. Pass type flags to auto-include entire categories, or list specific chats in includePeers. Emoticon must be a single emoji character.",
      inputSchema: {
        title: z.string().min(1).max(12).describe("Folder name (max 12 chars)"),
        emoticon: z.string().max(2).optional().describe("Single emoji icon for the folder"),
        contacts: z.boolean().optional().describe("Include all contacts"),
        nonContacts: z.boolean().optional().describe("Include all non-contacts"),
        groups: z.boolean().optional().describe("Include all groups"),
        broadcasts: z.boolean().optional().describe("Include all channels"),
        bots: z.boolean().optional().describe("Include all bots"),
        excludeMuted: z.boolean().optional().describe("Exclude muted chats"),
        excludeRead: z.boolean().optional().describe("Exclude read chats"),
        excludeArchived: z.boolean().optional().describe("Exclude archived chats"),
        includePeers: z
          .array(z.string())
          .max(100)
          .optional()
          .describe("Chat IDs/usernames to explicitly include (max 100)"),
        excludePeers: z
          .array(z.string())
          .max(100)
          .optional()
          .describe("Chat IDs/usernames to explicitly exclude (max 100)"),
        pinnedPeers: z.array(z.string()).max(5).optional().describe("Chats to pin at top of this folder (max 5)"),
      },
      annotations: WRITE,
    },
    async ({
      title,
      emoticon,
      contacts,
      nonContacts,
      groups,
      broadcasts,
      bots,
      excludeMuted,
      excludeRead,
      excludeArchived,
      includePeers,
      excludePeers,
      pinnedPeers,
    }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const id = await telegram.createFolder({
          title,
          emoticon,
          contacts,
          nonContacts,
          groups,
          broadcasts,
          bots,
          excludeMuted,
          excludeRead,
          excludeArchived,
          includePeers,
          excludePeers,
          pinnedPeers,
        });
        return ok(`Folder created: "${title}" [id=${id}]`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-edit-folder",
    {
      description:
        "Edit an existing Telegram chat folder by its ID (from telegram-get-chat-folders). Only pass fields you want to change — omitted fields keep their current values.",
      inputSchema: {
        id: z.number().int().min(2).describe("Folder ID (≥ 2; 0 = All Chats, 1 = Archive are system folders)"),
        title: z.string().min(1).max(12).optional().describe("New folder name (max 12 chars)"),
        emoticon: z.string().max(2).optional().describe("New emoji icon"),
        contacts: z.boolean().optional(),
        nonContacts: z.boolean().optional(),
        groups: z.boolean().optional(),
        broadcasts: z.boolean().optional(),
        bots: z.boolean().optional(),
        excludeMuted: z.boolean().optional(),
        excludeRead: z.boolean().optional(),
        excludeArchived: z.boolean().optional(),
        includePeers: z.array(z.string()).max(100).optional().describe("Replace includePeers list entirely"),
        excludePeers: z.array(z.string()).max(100).optional().describe("Replace excludePeers list entirely"),
        pinnedPeers: z.array(z.string()).max(5).optional().describe("Replace pinnedPeers list entirely"),
      },
      annotations: WRITE,
    },
    async ({
      id,
      title,
      emoticon,
      contacts,
      nonContacts,
      groups,
      broadcasts,
      bots,
      excludeMuted,
      excludeRead,
      excludeArchived,
      includePeers,
      excludePeers,
      pinnedPeers,
    }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.editFolder(id, {
          title,
          emoticon,
          contacts,
          nonContacts,
          groups,
          broadcasts,
          bots,
          excludeMuted,
          excludeRead,
          excludeArchived,
          includePeers,
          excludePeers,
          pinnedPeers,
        });
        return ok(`Folder ${id} updated`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-delete-folder",
    {
      description:
        "Delete a Telegram chat folder by its ID. Chats inside the folder are not deleted — they remain in All Chats. System folders (0 = All Chats, 1 = Archive) cannot be deleted.",
      inputSchema: {
        id: z.number().int().min(2).describe("Folder ID to delete (≥ 2)"),
      },
      annotations: WRITE,
    },
    async ({ id }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.deleteFolder(id);
        return ok(`Folder ${id} deleted`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-reorder-folders",
    {
      description:
        "Reorder Telegram chat folders by specifying a new order of folder IDs. All existing custom folder IDs must be included.",
      inputSchema: {
        order: z
          .array(z.number().int().min(2))
          .min(1)
          .describe("Ordered list of folder IDs (≥ 2). Obtain IDs from telegram-get-chat-folders"),
      },
      annotations: WRITE,
    },
    async ({ order }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.reorderFolders(order);
        return ok(`Folders reordered: [${order.join(", ")}]`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-suggested-folders",
    {
      description:
        "Get Telegram's suggested chat folders based on your chat list (e.g. 'Unread', 'Personal', 'Work'). Returns folder templates you can create with telegram-create-folder.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const suggestions = await telegram.getSuggestedFolders();
        if (!suggestions.length) return ok("No folder suggestions available");
        return ok(suggestions.map((s) => `${s.emoticon ? `${s.emoticon} ` : ""}${s.title}`).join("\n"));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-toggle-folder-tags",
    {
      description:
        "Enable or disable folder tags (colored labels that appear on messages in chat lists when the message belongs to a tagged folder). Requires Telegram Premium.",
      inputSchema: {
        enabled: z.boolean().describe("true to enable folder tags, false to disable"),
      },
      annotations: WRITE,
    },
    async ({ enabled }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.toggleDialogFilterTags(enabled);
        return ok(`Folder tags ${enabled ? "enabled" : "disabled"}`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-get-global-privacy-settings",
    {
      description:
        "Get your account-level global privacy settings: whether new non-contacts are auto-archived/muted, whether archived chats are kept unmuted, whether read receipts are hidden, and whether non-contacts must have Premium to message you.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        const s = await telegram.getGlobalPrivacySettings();
        return ok(JSON.stringify(s, null, 2));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "telegram-set-global-privacy-settings",
    {
      description:
        "Update account-level global privacy settings. Only pass the fields you want to change — omitted fields keep their current values. hideReadMarks and newNoncontactPeersRequirePremium require Telegram Premium.",
      inputSchema: {
        archiveAndMuteNewNoncontactPeers: z
          .boolean()
          .optional()
          .describe("Auto-archive and mute messages from unknown users"),
        keepArchivedUnmuted: z.boolean().optional().describe("Keep archived chats unmuted when archiving"),
        keepArchivedFolders: z.boolean().optional().describe("Keep archived chats in their folders"),
        hideReadMarks: z
          .boolean()
          .optional()
          .describe("Hide read receipts — others cannot see when you read their messages (Premium)"),
        newNoncontactPeersRequirePremium: z
          .boolean()
          .optional()
          .describe("Only allow users with Telegram Premium to message you if they are not in your contacts (Premium)"),
      },
      annotations: WRITE,
    },
    async ({
      archiveAndMuteNewNoncontactPeers,
      keepArchivedUnmuted,
      keepArchivedFolders,
      hideReadMarks,
      newNoncontactPeersRequirePremium,
    }) => {
      const err = await requireConnection(telegram);
      if (err) return fail(new Error(err));
      try {
        await telegram.setGlobalPrivacySettings({
          archiveAndMuteNewNoncontactPeers,
          keepArchivedUnmuted,
          keepArchivedFolders,
          hideReadMarks,
          newNoncontactPeersRequirePremium,
        });
        const changed = Object.entries({
          archiveAndMuteNewNoncontactPeers,
          keepArchivedUnmuted,
          keepArchivedFolders,
          hideReadMarks,
          newNoncontactPeersRequirePremium,
        })
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        return ok(`Global privacy updated: ${changed || "no fields changed"}`);
      } catch (e) {
        return fail(e);
      }
    },
  );
}
