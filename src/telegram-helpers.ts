import { randomBytes } from "node:crypto";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";

/**
 * Build an InputReplyToMessage from optional replyTo / topicId, matching the shape used by
 * raw messages.SendMedia. Returns undefined when neither is set so the caller can spread-omit it.
 */
export function buildReplyTo(replyTo?: number, topicId?: number): Api.InputReplyToMessage | undefined {
  if (!replyTo && !topicId) return undefined;
  // Telegram expects replyToMsgId to equal topicId when replying to the topic root
  // (posting into a topic without quoting a specific message inside it).
  return new Api.InputReplyToMessage({
    replyToMsgId: (replyTo ?? topicId) as number,
    topMsgId: topicId,
  });
}

/** Cryptographically random 64-bit bigInt for TL randomId (SendMedia/SendMultiMedia require it). */
export function generateRandomBigInt(): bigInt.BigInteger {
  return bigInt(randomBytes(8).toString("hex"), 16);
}

/**
 * Extract the server-assigned message ID from an Updates envelope returned by SendMedia/SendMessage.
 * Prefers UpdateMessageID (authoritative for SendMedia), falls back to UpdateNewMessage /
 * UpdateNewChannelMessage for safety. Returns undefined when no ID is found.
 */
export function extractMessageId(
  result: Api.TypeUpdates | Api.Message | Api.UpdateShortSentMessage | undefined,
): number | undefined {
  if (!result) return undefined;
  if (result instanceof Api.Message) return result.id;
  if (result instanceof Api.UpdateShortSentMessage) return result.id;
  if (result instanceof Api.Updates || result instanceof Api.UpdatesCombined) {
    for (const u of result.updates) {
      if (u instanceof Api.UpdateMessageID) return u.id;
    }
    for (const u of result.updates) {
      if (u instanceof Api.UpdateNewMessage || u instanceof Api.UpdateNewChannelMessage) {
        if (u.message instanceof Api.Message) return u.message.id;
      }
    }
  }
  return undefined;
}

/**
 * Extract the MessageMediaDice value and captured message ID from a SendMedia dice envelope.
 * Value is only present in UpdateNewMessage/UpdateNewChannelMessage; UpdateMessageID carries the ID only.
 */
export function extractDiceResult(result: Api.TypeUpdates | undefined): { id: number; value?: number } | undefined {
  if (!result) return undefined;
  if (!(result instanceof Api.Updates) && !(result instanceof Api.UpdatesCombined)) return undefined;
  let id: number | undefined;
  let value: number | undefined;
  for (const u of result.updates) {
    if (u instanceof Api.UpdateMessageID && id === undefined) id = u.id;
    if (u instanceof Api.UpdateNewMessage || u instanceof Api.UpdateNewChannelMessage) {
      if (u.message instanceof Api.Message) {
        if (id === undefined) id = u.message.id;
        if (u.message.media instanceof Api.MessageMediaDice) value = u.message.media.value;
      }
    }
  }
  if (id === undefined) return undefined;
  return { id, value };
}

export function describeAdminLogAction(action: Api.TypeChannelAdminLogEventAction): string {
  const prefix = "ChannelAdminLogEventAction";
  const raw = action.className.startsWith(prefix) ? action.className.slice(prefix.length) : action.className;
  return raw
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

export function describeAdminLogDetails(
  action: Api.TypeChannelAdminLogEventAction,
  describeUser: (userId: bigInt.BigInteger) => string,
): string {
  if (action instanceof Api.ChannelAdminLogEventActionChangeTitle) {
    return `"${action.prevValue}" → "${action.newValue}"`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionChangeAbout) {
    return `description changed`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionChangeUsername) {
    return `@${action.prevValue || "-"} → @${action.newValue || "-"}`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionUpdatePinned) {
    return `message #${action.message instanceof Api.Message ? action.message.id : "?"}`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionEditMessage) {
    return `message #${action.newMessage instanceof Api.Message ? action.newMessage.id : "?"}`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionDeleteMessage) {
    return `message #${action.message instanceof Api.Message ? action.message.id : "?"}`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionParticipantInvite) {
    const p = action.participant;
    return `invited user ${"userId" in p ? describeUser(p.userId) : "?"}`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionParticipantToggleBan) {
    const p = action.newParticipant;
    if (p instanceof Api.ChannelParticipantBanned) {
      const uid = p.peer instanceof Api.PeerUser ? p.peer.userId : undefined;
      return `banned user ${uid ? describeUser(uid) : "?"}`;
    }
    return `unbanned user ${"userId" in p ? describeUser((p as Api.ChannelParticipant).userId) : "?"}`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionParticipantToggleAdmin) {
    const p = action.newParticipant;
    return `admin rights changed for ${"userId" in p ? describeUser(p.userId) : "?"}`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionToggleSlowMode) {
    return `${action.prevValue}s → ${action.newValue}s`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionToggleInvites) {
    return `invites ${action.newValue ? "enabled" : "disabled"}`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionToggleSignatures) {
    return `signatures ${action.newValue ? "enabled" : "disabled"}`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionTogglePreHistoryHidden) {
    return `pre-history hidden: ${action.newValue}`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionChangeHistoryTTL) {
    return `${action.prevValue}s → ${action.newValue}s`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionChangeStickerSet) {
    return `sticker set changed`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionChangeLinkedChat) {
    return `${action.prevValue.toString()} → ${action.newValue.toString()}`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionStopPoll) {
    return `poll in message #${action.message instanceof Api.Message ? action.message.id : "?"}`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionSendMessage) {
    return `message #${action.message instanceof Api.Message ? action.message.id : "?"}`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionCreateTopic) {
    return `topic "${action.topic instanceof Api.ForumTopic ? action.topic.title : "?"}"`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionDeleteTopic) {
    return `topic "${action.topic instanceof Api.ForumTopic ? action.topic.title : "?"}"`;
  }
  if (action instanceof Api.ChannelAdminLogEventActionEditTopic) {
    return `topic "${action.newTopic instanceof Api.ForumTopic ? action.newTopic.title : "?"}"`;
  }
  return "";
}

export function reactionToEmoji(reaction: Api.TypeReaction): string | null {
  if (reaction instanceof Api.ReactionEmoji) return reaction.emoticon;
  if (reaction instanceof Api.ReactionCustomEmoji) return `custom:${reaction.documentId.toString()}`;
  if (reaction instanceof Api.ReactionPaid) return "⭐";
  return null;
}

export type CompactStatsGraph =
  | { type: "async"; token: string }
  | { type: "error"; error: string }
  | { type: "data"; data: unknown; zoomToken?: string };

export type StatsValue = { current: number; previous: number };

export type BroadcastStatsSummary = {
  period: { minDate: number; maxDate: number };
  followers: StatsValue;
  viewsPerPost: StatsValue;
  sharesPerPost: StatsValue;
  reactionsPerPost: StatsValue;
  viewsPerStory: StatsValue;
  sharesPerStory: StatsValue;
  reactionsPerStory: StatsValue;
  enabledNotifications: { part: number; total: number; percent: number };
  recentPostsInteractions: Array<
    | { kind: "message"; msgId: number; views: number; forwards: number; reactions: number }
    | { kind: "story"; storyId: number; views: number; forwards: number; reactions: number }
  >;
  graphs?: Record<string, CompactStatsGraph>;
};

function absValue(v: { current: number; previous: number } | undefined): StatsValue {
  return { current: v?.current ?? 0, previous: v?.previous ?? 0 };
}

function compactGraph(g: Api.TypeStatsGraph): CompactStatsGraph {
  if (g instanceof Api.StatsGraphAsync) return { type: "async", token: g.token };
  if (g instanceof Api.StatsGraphError) return { type: "error", error: g.error };
  if (g instanceof Api.StatsGraph) {
    let parsed: unknown = g.json?.data;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        // leave raw string
      }
    }
    return { type: "data", data: parsed, zoomToken: g.zoomToken };
  }
  const graph = g as { token?: string; error?: string; json?: { data?: string }; zoomToken?: string };
  if (typeof graph.token === "string") return { type: "async", token: graph.token };
  if (typeof graph.error === "string") return { type: "error", error: graph.error };
  return { type: "data", data: graph.json?.data, zoomToken: graph.zoomToken };
}

export type MegagroupStatsSummary = {
  period: { minDate: number; maxDate: number };
  members: StatsValue;
  messages: StatsValue;
  viewers: StatsValue;
  posters: StatsValue;
  topPosters: Array<{ userId: string; messages: number; avgChars: number }>;
  topAdmins: Array<{ userId: string; deleted: number; kicked: number; banned: number }>;
  topInviters: Array<{ userId: string; invitations: number }>;
  graphs?: Record<string, CompactStatsGraph>;
};

export function summarizeMegagroupStats(
  stats: Api.stats.MegagroupStats,
  includeGraphs: boolean,
): MegagroupStatsSummary {
  const summary: MegagroupStatsSummary = {
    period: {
      minDate: stats.period?.minDate ?? 0,
      maxDate: stats.period?.maxDate ?? 0,
    },
    members: absValue(stats.members),
    messages: absValue(stats.messages),
    viewers: absValue(stats.viewers),
    posters: absValue(stats.posters),
    topPosters: (stats.topPosters ?? []).map((p) => ({
      userId: p.userId?.toString() ?? "",
      messages: p.messages,
      avgChars: p.avgChars,
    })),
    topAdmins: (stats.topAdmins ?? []).map((a) => ({
      userId: a.userId?.toString() ?? "",
      deleted: a.deleted,
      kicked: a.kicked,
      banned: a.banned,
    })),
    topInviters: (stats.topInviters ?? []).map((i) => ({
      userId: i.userId?.toString() ?? "",
      invitations: i.invitations,
    })),
  };
  if (includeGraphs) {
    summary.graphs = {
      growth: compactGraph(stats.growthGraph),
      members: compactGraph(stats.membersGraph),
      newMembersBySource: compactGraph(stats.newMembersBySourceGraph),
      languages: compactGraph(stats.languagesGraph),
      messages: compactGraph(stats.messagesGraph),
      actions: compactGraph(stats.actionsGraph),
      topHours: compactGraph(stats.topHoursGraph),
      weekdays: compactGraph(stats.weekdaysGraph),
    };
  }
  return summary;
}

export function summarizeBroadcastStats(
  stats: Api.stats.BroadcastStats,
  includeGraphs: boolean,
): BroadcastStatsSummary {
  const enabled = stats.enabledNotifications;
  const part = enabled?.part ?? 0;
  const total = enabled?.total ?? 0;
  const percent = total > 0 ? (part / total) * 100 : 0;
  const summary: BroadcastStatsSummary = {
    period: {
      minDate: stats.period?.minDate ?? 0,
      maxDate: stats.period?.maxDate ?? 0,
    },
    followers: absValue(stats.followers),
    viewsPerPost: absValue(stats.viewsPerPost),
    sharesPerPost: absValue(stats.sharesPerPost),
    reactionsPerPost: absValue(stats.reactionsPerPost),
    viewsPerStory: absValue(stats.viewsPerStory),
    sharesPerStory: absValue(stats.sharesPerStory),
    reactionsPerStory: absValue(stats.reactionsPerStory),
    enabledNotifications: { part, total, percent },
    recentPostsInteractions: (stats.recentPostsInteractions ?? []).map((p) => {
      if (p instanceof Api.PostInteractionCountersStory) {
        return {
          kind: "story" as const,
          storyId: p.storyId,
          views: p.views,
          forwards: p.forwards,
          reactions: p.reactions,
        };
      }
      const m = p as Api.PostInteractionCountersMessage;
      return {
        kind: "message" as const,
        msgId: m.msgId,
        views: m.views,
        forwards: m.forwards,
        reactions: m.reactions,
      };
    }),
  };
  if (includeGraphs) {
    summary.graphs = {
      growth: compactGraph(stats.growthGraph),
      followers: compactGraph(stats.followersGraph),
      mute: compactGraph(stats.muteGraph),
      topHours: compactGraph(stats.topHoursGraph),
      interactions: compactGraph(stats.interactionsGraph),
      ivInteractions: compactGraph(stats.ivInteractionsGraph),
      viewsBySource: compactGraph(stats.viewsBySourceGraph),
      newFollowersBySource: compactGraph(stats.newFollowersBySourceGraph),
      languages: compactGraph(stats.languagesGraph),
      reactionsByEmotion: compactGraph(stats.reactionsByEmotionGraph),
      storyInteractions: compactGraph(stats.storyInteractionsGraph),
      storyReactionsByEmotion: compactGraph(stats.storyReactionsByEmotionGraph),
    };
  }
  return summary;
}

export type ChatPermissions = {
  sendMessages?: boolean;
  sendMedia?: boolean;
  sendStickers?: boolean;
  sendGifs?: boolean;
  sendPolls?: boolean;
  sendInline?: boolean;
  embedLinks?: boolean;
  changeInfo?: boolean;
  inviteUsers?: boolean;
  pinMessages?: boolean;
};

const BANNED_RIGHT_FLAGS = [
  "sendMessages",
  "sendMedia",
  "sendStickers",
  "sendGifs",
  "sendPolls",
  "sendInline",
  "embedLinks",
  "changeInfo",
  "inviteUsers",
  "pinMessages",
] as const;

// Newer granular flags not exposed in ChatPermissions input but must be preserved from currentRights
const EXTRA_BANNED_RIGHT_FLAGS = [
  "sendGames",
  "manageTopics",
  "sendPhotos",
  "sendVideos",
  "sendRoundvideos",
  "sendAudios",
  "sendVoices",
  "sendDocs",
  "sendPlain",
] as const;

export function mergeBannedRights(
  current: Record<string, unknown> | undefined | null,
  permissions: ChatPermissions,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const flag of BANNED_RIGHT_FLAGS) {
    const userValue = permissions[flag];
    if (userValue !== undefined) {
      result[flag] = !userValue;
    } else {
      result[flag] = Boolean(current?.[flag]);
    }
  }
  // Preserve newer granular flags from existing rights so they are not silently cleared
  for (const flag of EXTRA_BANNED_RIGHT_FLAGS) {
    result[flag] = Boolean(current?.[flag]);
  }
  return result;
}

export type MessageButtonDescriptor = {
  row: number;
  col: number;
  type: string;
  label: string;
  data?: string;
  url?: string;
  switchQuery?: string;
  samePeer?: boolean;
  userId?: string;
  buttonId?: number;
  copyText?: string;
  requiresPassword?: boolean;
  quiz?: boolean;
};

export function describeKeyboardButton(
  button: Api.TypeKeyboardButton,
  row: number,
  col: number,
): MessageButtonDescriptor {
  const base: MessageButtonDescriptor = {
    row,
    col,
    type: button.className,
    label: "text" in button && typeof (button as { text?: unknown }).text === "string" ? button.text : "",
  };
  if (button instanceof Api.KeyboardButtonCallback) {
    base.data = Buffer.from(button.data as Uint8Array).toString("base64");
    if (button.requiresPassword) base.requiresPassword = true;
    return base;
  }
  if (button instanceof Api.KeyboardButtonUrl) {
    base.url = button.url;
    return base;
  }
  if (button instanceof Api.KeyboardButtonUrlAuth) {
    base.url = button.url;
    base.buttonId = button.buttonId;
    return base;
  }
  if (button instanceof Api.KeyboardButtonSwitchInline) {
    base.switchQuery = button.query;
    base.samePeer = Boolean(button.samePeer);
    return base;
  }
  if (button instanceof Api.KeyboardButtonWebView || button instanceof Api.KeyboardButtonSimpleWebView) {
    base.url = button.url;
    return base;
  }
  if (button instanceof Api.KeyboardButtonUserProfile) {
    base.userId = button.userId?.toString();
    return base;
  }
  if (button instanceof Api.KeyboardButtonRequestPoll) {
    if (button.quiz) base.quiz = true;
    return base;
  }
  if (button instanceof Api.KeyboardButtonRequestPeer) {
    base.buttonId = button.buttonId;
    return base;
  }
  if (button instanceof Api.KeyboardButtonCopy) {
    base.copyText = button.copyText;
    return base;
  }
  return base;
}

export type CompactPeer = { kind: "user"; id: string } | { kind: "chat"; id: string } | { kind: "channel"; id: string };

export type UpdatesMessageSummary = {
  id: number;
  peer: CompactPeer;
  fromId?: CompactPeer;
  date: number;
  text: string;
  isService: boolean;
};

export type UpdatesDifferenceSummary = {
  state: { pts: number; qts: number; date: number; seq: number; unreadCount?: number };
  isFinal: boolean;
  newMessages: UpdatesMessageSummary[];
  deletedMessageIds: Array<{ peer?: CompactPeer; messageIds: number[] }>;
  otherUpdates: Array<{ type: string }>;
  fallback?: { kind: "tooLong"; suggestedAction: string };
};

export type ChannelDifferenceSummary = {
  channelId: string;
  pts: number;
  isFinal: boolean;
  timeout?: number;
  newMessages: UpdatesMessageSummary[];
  otherUpdates: Array<{ type: string }>;
  fallback?: { kind: "tooLong"; suggestedAction: string };
};

export function peerToCompact(peer: Api.TypePeer | undefined): CompactPeer | undefined {
  if (!peer) return undefined;
  if (peer instanceof Api.PeerUser) return { kind: "user", id: peer.userId.toString() };
  if (peer instanceof Api.PeerChat) return { kind: "chat", id: peer.chatId.toString() };
  if (peer instanceof Api.PeerChannel) return { kind: "channel", id: peer.channelId.toString() };
  return undefined;
}

function summarizeMessageForUpdates(msg: Api.TypeMessage): UpdatesMessageSummary | null {
  if (msg instanceof Api.MessageEmpty) return null;
  const peer = peerToCompact((msg as Api.Message | Api.MessageService).peerId);
  if (!peer) return null;
  const fromId = peerToCompact((msg as Api.Message | Api.MessageService).fromId);
  const date = (msg as Api.Message | Api.MessageService).date ?? 0;
  if (msg instanceof Api.Message) {
    return { id: msg.id, peer, fromId, date, text: msg.message ?? "", isService: false };
  }
  if (msg instanceof Api.MessageService) {
    return {
      id: msg.id,
      peer,
      fromId,
      date,
      text: `[${msg.action?.className ?? "service"}]`,
      isService: true,
    };
  }
  return null;
}

function collectDeletedMessageIds(updates: Api.TypeUpdate[]): Array<{ peer?: CompactPeer; messageIds: number[] }> {
  const out: Array<{ peer?: CompactPeer; messageIds: number[] }> = [];
  for (const u of updates) {
    if (u instanceof Api.UpdateDeleteMessages) {
      out.push({ messageIds: u.messages });
    } else if (u instanceof Api.UpdateDeleteChannelMessages) {
      out.push({
        peer: { kind: "channel", id: u.channelId.toString() },
        messageIds: u.messages,
      });
    }
  }
  return out;
}

export function summarizeUpdatesDifference(
  diff: Api.updates.TypeDifference,
  cursor: { pts: number; qts: number; date: number },
): UpdatesDifferenceSummary {
  if (diff instanceof Api.updates.DifferenceEmpty) {
    return {
      state: { pts: cursor.pts, qts: cursor.qts, date: diff.date, seq: diff.seq },
      isFinal: true,
      newMessages: [],
      deletedMessageIds: [],
      otherUpdates: [],
    };
  }
  if (diff instanceof Api.updates.DifferenceTooLong) {
    return {
      state: { pts: diff.pts, qts: cursor.qts, date: cursor.date, seq: 0 },
      isFinal: true,
      newMessages: [],
      deletedMessageIds: [],
      otherUpdates: [],
      fallback: {
        kind: "tooLong",
        suggestedAction: "gap too large — call telegram-read-messages per chat or telegram-get-state to resync",
      },
    };
  }
  const isFinal = diff instanceof Api.updates.Difference;
  const state = isFinal
    ? (diff as Api.updates.Difference).state
    : (diff as Api.updates.DifferenceSlice).intermediateState;
  const newMessages = (diff.newMessages ?? [])
    .map(summarizeMessageForUpdates)
    .filter((m): m is UpdatesMessageSummary => m !== null);
  const otherUpdates = diff.otherUpdates ?? [];
  return {
    state: {
      pts: state.pts,
      qts: state.qts,
      date: state.date,
      seq: state.seq,
      unreadCount: state.unreadCount,
    },
    isFinal,
    newMessages,
    deletedMessageIds: collectDeletedMessageIds(otherUpdates),
    otherUpdates: otherUpdates.map((u) => ({ type: u.className })),
  };
}

export function summarizeChannelDifference(
  diff: Api.updates.TypeChannelDifference,
  channelId: string,
  fallbackPts: number,
): ChannelDifferenceSummary {
  if (diff instanceof Api.updates.ChannelDifferenceEmpty) {
    return {
      channelId,
      pts: diff.pts,
      isFinal: Boolean(diff.final),
      timeout: diff.timeout,
      newMessages: [],
      otherUpdates: [],
    };
  }
  if (diff instanceof Api.updates.ChannelDifferenceTooLong) {
    const freshPts = diff.dialog instanceof Api.Dialog ? (diff.dialog.pts ?? fallbackPts) : fallbackPts;
    return {
      channelId,
      pts: freshPts,
      isFinal: Boolean(diff.final),
      timeout: diff.timeout,
      newMessages: (diff.messages ?? [])
        .map(summarizeMessageForUpdates)
        .filter((m): m is UpdatesMessageSummary => m !== null),
      otherUpdates: [],
      fallback: {
        kind: "tooLong",
        suggestedAction:
          "channel gap too large — dialog snapshot returned; call telegram-read-messages for full history",
      },
    };
  }
  if (diff instanceof Api.updates.ChannelDifference) {
    return {
      channelId,
      pts: diff.pts,
      isFinal: Boolean(diff.final),
      timeout: diff.timeout,
      newMessages: (diff.newMessages ?? [])
        .map(summarizeMessageForUpdates)
        .filter((m): m is UpdatesMessageSummary => m !== null),
      otherUpdates: (diff.otherUpdates ?? []).map((u) => ({ type: u.className })),
    };
  }
  return {
    channelId,
    pts: fallbackPts,
    isFinal: false,
    newMessages: [],
    otherUpdates: [],
  };
}

export type StoryItemSummary = {
  id: number;
  kind: "active" | "deleted" | "skipped";
  date?: number;
  expireDate?: number;
  caption?: string;
  mediaType?: string;
  pinned?: boolean;
  public?: boolean;
  closeFriends?: boolean;
  edited?: boolean;
  noforwards?: boolean;
  fromId?: CompactPeer;
  viewsCount?: number;
  reactionsCount?: number;
};

export type PeerStoriesSummary = {
  peer: CompactPeer;
  maxReadId?: number;
  stories: StoryItemSummary[];
};

export type AllStoriesSummary = {
  modified: boolean;
  state: string;
  hasMore?: boolean;
  count?: number;
  peerStories: PeerStoriesSummary[];
  stealthMode?: { activeUntilDate?: number; cooldownUntilDate?: number };
};

export type StoriesByIdSummary = {
  count: number;
  stories: StoryItemSummary[];
  pinnedToTop?: number[];
};

export type StoryViewSummary =
  | {
      kind: "user";
      userId: string;
      date: number;
      reaction?: string | null;
      blocked?: boolean;
      blockedMyStoriesFrom?: boolean;
    }
  | {
      kind: "publicForward";
      messageId?: number;
      peer?: CompactPeer;
      blocked?: boolean;
      blockedMyStoriesFrom?: boolean;
    }
  | {
      kind: "publicRepost";
      peer?: CompactPeer;
      storyId?: number;
      blocked?: boolean;
      blockedMyStoriesFrom?: boolean;
    };

export type StoryViewsListSummary = {
  count: number;
  viewsCount: number;
  forwardsCount: number;
  reactionsCount: number;
  views: StoryViewSummary[];
  nextOffset?: string;
};

export type MyBoostSummary = {
  slot: number;
  peer?: CompactPeer;
  date: number;
  expires: number;
  cooldownUntilDate?: number;
};

export type MyBoostsSummary = {
  count: number;
  myBoosts: MyBoostSummary[];
};

export function summarizeMyBoost(boost: Api.TypeMyBoost): MyBoostSummary {
  const b = boost as Api.MyBoost;
  return {
    slot: b.slot,
    peer: peerToCompact(b.peer),
    date: b.date,
    expires: b.expires,
    cooldownUntilDate: b.cooldownUntilDate,
  };
}

export function summarizeMyBoosts(result: Api.premium.TypeMyBoosts): MyBoostsSummary {
  const boosts = result.myBoosts ?? [];
  return {
    count: boosts.length,
    myBoosts: boosts.map(summarizeMyBoost),
  };
}

export type PrepaidGiveawaySummary = {
  kind: "premium" | "stars";
  id: string;
  quantity: number;
  date: number;
  months?: number;
  stars?: string;
  boosts?: number;
};

export type BoostsStatusSummary = {
  level: number;
  boosts: number;
  currentLevelBoosts: number;
  nextLevelBoosts?: number;
  giftBoosts?: number;
  premiumAudience?: { part: number; total: number };
  boostUrl: string;
  myBoost?: boolean;
  myBoostSlots?: number[];
  prepaidGiveaways?: PrepaidGiveawaySummary[];
};

export function summarizePrepaidGiveaway(g: Api.TypePrepaidGiveaway): PrepaidGiveawaySummary {
  if (g instanceof Api.PrepaidStarsGiveaway) {
    return {
      kind: "stars",
      id: g.id.toString(),
      quantity: g.quantity,
      date: g.date,
      stars: g.stars.toString(),
      boosts: g.boosts,
    };
  }
  const p = g as Api.PrepaidGiveaway;
  return {
    kind: "premium",
    id: p.id.toString(),
    quantity: p.quantity,
    date: p.date,
    months: p.months,
  };
}

export function summarizeBoostsStatus(result: Api.premium.TypeBoostsStatus): BoostsStatusSummary {
  const r = result as Api.premium.BoostsStatus;
  const out: BoostsStatusSummary = {
    level: r.level,
    boosts: r.boosts,
    currentLevelBoosts: r.currentLevelBoosts,
    nextLevelBoosts: r.nextLevelBoosts,
    giftBoosts: r.giftBoosts,
    boostUrl: r.boostUrl,
    myBoost: r.myBoost,
    myBoostSlots: r.myBoostSlots,
  };
  if (r.premiumAudience) {
    out.premiumAudience = { part: r.premiumAudience.part, total: r.premiumAudience.total };
  }
  if (r.prepaidGiveaways && r.prepaidGiveaways.length > 0) {
    out.prepaidGiveaways = r.prepaidGiveaways.map(summarizePrepaidGiveaway);
  }
  return out;
}

export type BoostSummary = {
  id: string;
  userId?: string;
  date: number;
  expires: number;
  gift?: boolean;
  giveaway?: boolean;
  unclaimed?: boolean;
  giveawayMsgId?: number;
  usedGiftSlug?: string;
  multiplier?: number;
  stars?: string;
};

export type BoostsListSummary = {
  count: number;
  boosts: BoostSummary[];
  nextOffset?: string;
};

export function summarizeBoost(boost: Api.TypeBoost): BoostSummary {
  const b = boost as Api.Boost;
  return {
    id: b.id,
    userId: b.userId?.toString(),
    date: b.date,
    expires: b.expires,
    gift: b.gift,
    giveaway: b.giveaway,
    unclaimed: b.unclaimed,
    giveawayMsgId: b.giveawayMsgId,
    usedGiftSlug: b.usedGiftSlug,
    multiplier: b.multiplier,
    stars: b.stars?.toString(),
  };
}

export function summarizeBoostsList(result: Api.premium.TypeBoostsList): BoostsListSummary {
  const r = result as Api.premium.BoostsList;
  return {
    count: r.count,
    boosts: (r.boosts ?? []).map(summarizeBoost),
    nextOffset: r.nextOffset,
  };
}

export type BusinessChatLinkSummary = {
  link: string;
  message: string;
  title?: string;
  views: number;
  entityCount: number;
};

export type BusinessChatLinksSummary = {
  count: number;
  links: BusinessChatLinkSummary[];
};

export function summarizeBusinessChatLink(link: Api.TypeBusinessChatLink): BusinessChatLinkSummary {
  const l = link as Api.BusinessChatLink;
  return {
    link: l.link,
    message: l.message,
    title: l.title,
    views: l.views,
    entityCount: l.entities?.length ?? 0,
  };
}

export function summarizeBusinessChatLinks(result: Api.account.TypeBusinessChatLinks): BusinessChatLinksSummary {
  const r = result as Api.account.BusinessChatLinks;
  const links = r.links ?? [];
  return {
    count: links.length,
    links: links.map(summarizeBusinessChatLink),
  };
}

export type GroupCallInfoSummary =
  | {
      kind: "active";
      id: string;
      accessHash: string;
      participantsCount: number;
      title?: string;
      scheduleDate?: number;
      recordStartDate?: number;
      streamDcId?: number;
      unmutedVideoCount?: number;
      unmutedVideoLimit: number;
      version: number;
      joinMuted?: boolean;
      canChangeJoinMuted?: boolean;
      joinDateAsc?: boolean;
      scheduleStartSubscribed?: boolean;
      canStartVideo?: boolean;
      recordVideoActive?: boolean;
      rtmpStream?: boolean;
      listenersHidden?: boolean;
    }
  | {
      kind: "discarded";
      id: string;
      accessHash: string;
      duration: number;
    };

export type GroupCallParticipantSummary = {
  peer: CompactPeer | undefined;
  date: number;
  activeDate?: number;
  source: number;
  volume?: number;
  muted?: boolean;
  left?: boolean;
  canSelfUnmute?: boolean;
  justJoined?: boolean;
  self?: boolean;
  mutedByYou?: boolean;
  volumeByAdmin?: boolean;
  videoJoined?: boolean;
  about?: string;
  raiseHandRating?: string;
  hasVideo?: boolean;
  hasPresentation?: boolean;
};

export type GroupCallSummary = {
  call: GroupCallInfoSummary;
  participants: GroupCallParticipantSummary[];
  participantsNextOffset?: string;
};

export type GroupCallParticipantsSummary = {
  count: number;
  participants: GroupCallParticipantSummary[];
  nextOffset?: string;
  version: number;
};

export function summarizeGroupCallInfo(call: Api.TypeGroupCall): GroupCallInfoSummary {
  if (call instanceof Api.GroupCallDiscarded) {
    return {
      kind: "discarded",
      id: call.id.toString(),
      accessHash: call.accessHash.toString(),
      duration: call.duration,
    };
  }
  const c = call as Api.GroupCall;
  return {
    kind: "active",
    id: c.id.toString(),
    accessHash: c.accessHash.toString(),
    participantsCount: c.participantsCount,
    title: c.title,
    scheduleDate: c.scheduleDate,
    recordStartDate: c.recordStartDate,
    streamDcId: c.streamDcId,
    unmutedVideoCount: c.unmutedVideoCount,
    unmutedVideoLimit: c.unmutedVideoLimit,
    version: c.version,
    joinMuted: c.joinMuted,
    canChangeJoinMuted: c.canChangeJoinMuted,
    joinDateAsc: c.joinDateAsc,
    scheduleStartSubscribed: c.scheduleStartSubscribed,
    canStartVideo: c.canStartVideo,
    recordVideoActive: c.recordVideoActive,
    rtmpStream: c.rtmpStream,
    listenersHidden: c.listenersHidden,
  };
}

export function summarizeGroupCallParticipant(p: Api.TypeGroupCallParticipant): GroupCallParticipantSummary {
  const gp = p as Api.GroupCallParticipant;
  return {
    peer: peerToCompact(gp.peer),
    date: gp.date,
    activeDate: gp.activeDate,
    source: gp.source,
    volume: gp.volume,
    muted: gp.muted,
    left: gp.left,
    canSelfUnmute: gp.canSelfUnmute,
    justJoined: gp.justJoined,
    self: gp.self,
    mutedByYou: gp.mutedByYou,
    volumeByAdmin: gp.volumeByAdmin,
    videoJoined: gp.videoJoined,
    about: gp.about,
    raiseHandRating: gp.raiseHandRating?.toString(),
    hasVideo: gp.video ? true : undefined,
    hasPresentation: gp.presentation ? true : undefined,
  };
}

export function summarizeGroupCall(result: Api.phone.TypeGroupCall): GroupCallSummary {
  const r = result as Api.phone.GroupCall;
  return {
    call: summarizeGroupCallInfo(r.call),
    participants: (r.participants ?? []).map(summarizeGroupCallParticipant),
    participantsNextOffset: r.participantsNextOffset || undefined,
  };
}

export function summarizeGroupCallParticipants(result: Api.phone.TypeGroupParticipants): GroupCallParticipantsSummary {
  const r = result as Api.phone.GroupParticipants;
  return {
    count: r.count,
    participants: (r.participants ?? []).map(summarizeGroupCallParticipant),
    nextOffset: r.nextOffset || undefined,
    version: r.version,
  };
}

export type StarsAmountSummary = {
  amount: string;
  nanos: number;
};

export type StarsTransactionPeerSummary =
  | { kind: "appStore" }
  | { kind: "playMarket" }
  | { kind: "premiumBot" }
  | { kind: "fragment" }
  | { kind: "ads" }
  | { kind: "api" }
  | { kind: "unsupported" }
  | { kind: "peer"; peer: CompactPeer | undefined };

export type StarsTransactionSummary = {
  id: string;
  stars: StarsAmountSummary;
  date: number;
  peer: StarsTransactionPeerSummary;
  refund?: boolean;
  pending?: boolean;
  failed?: boolean;
  gift?: boolean;
  reaction?: boolean;
  title?: string;
  description?: string;
  msgId?: number;
  subscriptionPeriod?: number;
  giveawayPostId?: number;
  transactionDate?: number;
  transactionUrl?: string;
};

export type StarsSubscriptionPricingSummary = {
  period: number;
  amount: string;
};

export type StarsSubscriptionSummary = {
  id: string;
  peer: CompactPeer | undefined;
  untilDate: number;
  pricing: StarsSubscriptionPricingSummary;
  canceled?: boolean;
  canRefulfill?: boolean;
  missingBalance?: boolean;
  botCanceled?: boolean;
  chatInviteHash?: string;
  title?: string;
  invoiceSlug?: string;
};

export type StarsStatusSummary = {
  balance: StarsAmountSummary;
  subscriptions?: StarsSubscriptionSummary[];
  subscriptionsNextOffset?: string;
  subscriptionsMissingBalance?: string;
  history?: StarsTransactionSummary[];
  nextOffset?: string;
};

export function summarizeStarsAmount(amount: Api.TypeStarsAmount): StarsAmountSummary {
  const a = amount as Api.StarsAmount;
  return { amount: a.amount.toString(), nanos: a.nanos };
}

export function summarizeStarsTransactionPeer(peer: Api.TypeStarsTransactionPeer): StarsTransactionPeerSummary {
  if (peer instanceof Api.StarsTransactionPeerAppStore) return { kind: "appStore" };
  if (peer instanceof Api.StarsTransactionPeerPlayMarket) return { kind: "playMarket" };
  if (peer instanceof Api.StarsTransactionPeerPremiumBot) return { kind: "premiumBot" };
  if (peer instanceof Api.StarsTransactionPeerFragment) return { kind: "fragment" };
  if (peer instanceof Api.StarsTransactionPeerAds) return { kind: "ads" };
  if (peer instanceof Api.StarsTransactionPeerAPI) return { kind: "api" };
  if (peer instanceof Api.StarsTransactionPeer) return { kind: "peer", peer: peerToCompact(peer.peer) };
  return { kind: "unsupported" };
}

export function summarizeStarsTransaction(tx: Api.TypeStarsTransaction): StarsTransactionSummary {
  const t = tx as Api.StarsTransaction;
  return {
    id: t.id,
    stars: summarizeStarsAmount(t.stars),
    date: t.date,
    peer: summarizeStarsTransactionPeer(t.peer),
    refund: t.refund,
    pending: t.pending,
    failed: t.failed,
    gift: t.gift,
    reaction: t.reaction,
    title: t.title,
    description: t.description,
    msgId: t.msgId,
    subscriptionPeriod: t.subscriptionPeriod,
    giveawayPostId: t.giveawayPostId,
    transactionDate: t.transactionDate,
    transactionUrl: t.transactionUrl,
  };
}

export function summarizeStarsSubscription(sub: Api.TypeStarsSubscription): StarsSubscriptionSummary {
  const s = sub as Api.StarsSubscription;
  const pricing = s.pricing as Api.StarsSubscriptionPricing;
  return {
    id: s.id,
    peer: peerToCompact(s.peer),
    untilDate: s.untilDate,
    pricing: { period: pricing.period, amount: pricing.amount.toString() },
    canceled: s.canceled,
    canRefulfill: s.canRefulfill,
    missingBalance: s.missingBalance,
    botCanceled: s.botCanceled,
    chatInviteHash: s.chatInviteHash,
    title: s.title,
    invoiceSlug: s.invoiceSlug,
  };
}

export type QuickReplySummary = {
  shortcutId: number;
  shortcut: string;
  topMessage: number;
  count: number;
};

export type QuickRepliesSummary = {
  notModified?: boolean;
  quickReplies?: QuickReplySummary[];
};

export function summarizeQuickReply(reply: Api.TypeQuickReply): QuickReplySummary {
  const r = reply as Api.QuickReply;
  return {
    shortcutId: r.shortcutId,
    shortcut: r.shortcut,
    topMessage: r.topMessage,
    count: r.count,
  };
}

export function summarizeQuickReplies(result: Api.messages.TypeQuickReplies): QuickRepliesSummary {
  if (result instanceof Api.messages.QuickRepliesNotModified) {
    return { notModified: true };
  }
  const r = result as Api.messages.QuickReplies;
  return { quickReplies: r.quickReplies.map(summarizeQuickReply) };
}

export type QuickReplyMessageSummary = {
  id: number;
  date: number;
  text: string;
  isService: boolean;
  fromId?: CompactPeer;
  replyToMsgId?: number;
};

export type QuickReplyMessagesSummary = {
  notModified?: boolean;
  count?: number;
  messages?: QuickReplyMessageSummary[];
};

export function summarizeQuickReplyMessage(msg: Api.TypeMessage): QuickReplyMessageSummary | null {
  if (msg instanceof Api.MessageEmpty) return null;
  const base = msg as Api.Message | Api.MessageService;
  const fromId = peerToCompact(base.fromId);
  const replyHeader = (base as Api.Message).replyTo;
  const replyToMsgId = replyHeader instanceof Api.MessageReplyHeader ? replyHeader.replyToMsgId : undefined;
  if (msg instanceof Api.Message) {
    return {
      id: msg.id,
      date: msg.date,
      text: msg.message ?? "",
      isService: false,
      fromId,
      replyToMsgId,
    };
  }
  if (msg instanceof Api.MessageService) {
    return {
      id: msg.id,
      date: msg.date,
      text: `[${msg.action?.className ?? "service"}]`,
      isService: true,
      fromId,
    };
  }
  return null;
}

export function summarizeQuickReplyMessages(result: Api.messages.TypeMessages): QuickReplyMessagesSummary {
  if (result instanceof Api.messages.MessagesNotModified) {
    return { notModified: true, count: result.count };
  }
  const rawMessages = (result as Api.messages.Messages | Api.messages.MessagesSlice | Api.messages.ChannelMessages)
    .messages;
  const messages = rawMessages.map(summarizeQuickReplyMessage).filter((m): m is QuickReplyMessageSummary => m !== null);
  const count =
    result instanceof Api.messages.Messages
      ? messages.length
      : (result as Api.messages.MessagesSlice | Api.messages.ChannelMessages).count;
  return { count, messages };
}

export function summarizeStarsStatus(result: Api.payments.TypeStarsStatus): StarsStatusSummary {
  const r = result as Api.payments.StarsStatus;
  const out: StarsStatusSummary = {
    balance: summarizeStarsAmount(r.balance),
    subscriptionsNextOffset: r.subscriptionsNextOffset || undefined,
    subscriptionsMissingBalance: r.subscriptionsMissingBalance?.toString(),
    nextOffset: r.nextOffset || undefined,
  };
  if (r.subscriptions && r.subscriptions.length > 0) {
    out.subscriptions = r.subscriptions.map(summarizeStarsSubscription);
  }
  if (r.history && r.history.length > 0) {
    out.history = r.history.map(summarizeStarsTransaction);
  }
  return out;
}

export function summarizeStoryItem(item: Api.TypeStoryItem): StoryItemSummary {
  if (item instanceof Api.StoryItemDeleted) {
    return { id: item.id, kind: "deleted" };
  }
  if (item instanceof Api.StoryItemSkipped) {
    return {
      id: item.id,
      kind: "skipped",
      date: item.date,
      expireDate: item.expireDate,
      closeFriends: item.closeFriends,
    };
  }
  const story = item as Api.StoryItem;
  return {
    id: story.id,
    kind: "active",
    date: story.date,
    expireDate: story.expireDate,
    caption: story.caption,
    mediaType: story.media?.className,
    pinned: story.pinned,
    public: story.public,
    closeFriends: story.closeFriends,
    edited: story.edited,
    noforwards: story.noforwards,
    fromId: peerToCompact(story.fromId),
    viewsCount: story.views?.viewsCount,
    reactionsCount: story.views?.reactionsCount,
  };
}

export function summarizePeerStories(ps: Api.TypePeerStories): PeerStoriesSummary | null {
  const peer = peerToCompact(ps.peer);
  if (!peer) return null;
  return {
    peer,
    maxReadId: ps.maxReadId,
    stories: (ps.stories ?? []).map(summarizeStoryItem),
  };
}

export function summarizeStoriesById(result: Api.stories.TypeStories): StoriesByIdSummary {
  return {
    count: result.count,
    stories: (result.stories ?? []).map(summarizeStoryItem),
    pinnedToTop: result.pinnedToTop,
  };
}

export function summarizeStoryView(view: Api.TypeStoryView): StoryViewSummary {
  if (view instanceof Api.StoryViewPublicForward) {
    const msg = view.message as Api.Message | Api.MessageService | Api.MessageEmpty | undefined;
    const messageId = msg instanceof Api.MessageEmpty ? undefined : msg?.id;
    const peer =
      msg instanceof Api.MessageEmpty
        ? undefined
        : peerToCompact((msg as Api.Message | Api.MessageService | undefined)?.peerId);
    return {
      kind: "publicForward",
      messageId,
      peer,
      blocked: view.blocked,
      blockedMyStoriesFrom: view.blockedMyStoriesFrom,
    };
  }
  if (view instanceof Api.StoryViewPublicRepost) {
    const story = view.story as Api.StoryItem | Api.StoryItemDeleted | Api.StoryItemSkipped | undefined;
    return {
      kind: "publicRepost",
      peer: peerToCompact(view.peerId),
      storyId: story?.id,
      blocked: view.blocked,
      blockedMyStoriesFrom: view.blockedMyStoriesFrom,
    };
  }
  const v = view as Api.StoryView;
  return {
    kind: "user",
    userId: v.userId.toString(),
    date: v.date,
    reaction: v.reaction ? reactionToEmoji(v.reaction) : undefined,
    blocked: v.blocked,
    blockedMyStoriesFrom: v.blockedMyStoriesFrom,
  };
}

export function summarizeStoryViewsList(result: Api.stories.TypeStoryViewsList): StoryViewsListSummary {
  const list = result as Api.stories.StoryViewsList;
  return {
    count: list.count,
    viewsCount: list.viewsCount,
    forwardsCount: list.forwardsCount,
    reactionsCount: list.reactionsCount,
    views: (list.views ?? []).map(summarizeStoryView),
    nextOffset: list.nextOffset,
  };
}

// ─── Story Privacy ─────────────────────────────────────────────────────────

export type StoryPrivacy = "everyone" | "contacts" | "close_friends" | "selected";

export function detectMediaType(filePath: string): "photo" | "video" {
  const ext = filePath.toLowerCase().split(".").pop() ?? "";
  if (["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) return "photo";
  return "video";
}

export function buildStoryPrivacyRules(
  privacy: StoryPrivacy,
  allowUserIds?: string[],
  disallowUserIds?: string[],
): Api.TypeInputPrivacyRule[] {
  const rules: Api.TypeInputPrivacyRule[] = [];
  switch (privacy) {
    case "everyone":
      rules.push(new Api.InputPrivacyValueAllowAll());
      break;
    case "contacts":
      rules.push(new Api.InputPrivacyValueAllowContacts());
      break;
    case "close_friends":
      rules.push(new Api.InputPrivacyValueAllowCloseFriends());
      break;
    case "selected":
      rules.push(
        new Api.InputPrivacyValueAllowUsers({
          users: (allowUserIds ?? []).map((id) => new Api.InputUser({ userId: bigInt(id), accessHash: bigInt(0) })),
        }),
      );
      break;
  }
  if (disallowUserIds?.length && privacy !== "selected") {
    rules.push(
      new Api.InputPrivacyValueDisallowUsers({
        users: disallowUserIds.map((id) => new Api.InputUser({ userId: bigInt(id), accessHash: bigInt(0) })),
      }),
    );
  }
  return rules;
}

export function extractStoryIdFromUpdates(result: Api.TypeUpdates | undefined): number {
  if (!result) return 0;
  if (result instanceof Api.Updates || result instanceof Api.UpdatesCombined) {
    for (const u of result.updates) {
      if (u instanceof Api.UpdateStoryID) return u.id;
    }
    for (const u of result.updates) {
      if (u instanceof Api.UpdateStory && u.story instanceof Api.StoryItem) return u.story.id;
    }
  }
  return 0;
}

// ─── Discussion ────────────────────────────────────────────────────────────

export type DiscussionMessageSummary = {
  discussionGroupId: string;
  discussionMsgId: number;
  unreadCount: number;
  readInboxMaxId?: number;
  readOutboxMaxId?: number;
  topMessage?: { id: number; text?: string; date: number };
};

export function summarizeDiscussionMessage(result: Api.messages.DiscussionMessage): DiscussionMessageSummary {
  const topMsg = result.messages?.[0];
  let discussionGroupId = "";
  for (const chat of result.chats ?? []) {
    const isBroadcast = "broadcast" in chat && (chat as Api.Channel).broadcast;
    if (!isBroadcast) {
      discussionGroupId = `-100${chat.id.toString()}`;
      break;
    }
  }
  const discussionMsgId = topMsg instanceof Api.Message || topMsg instanceof Api.MessageService ? topMsg.id : 0;
  const topMessage =
    topMsg instanceof Api.Message
      ? {
          id: topMsg.id,
          text: topMsg.message?.slice(0, 200),
          date: topMsg.date,
        }
      : undefined;
  return {
    discussionGroupId,
    discussionMsgId,
    unreadCount: result.unreadCount ?? 0,
    readInboxMaxId: result.readInboxMaxId,
    readOutboxMaxId: result.readOutboxMaxId,
    topMessage,
  };
}

// ─── Groups For Discussion ─────────────────────────────────────────────────

export type GroupsForDiscussionSummary = {
  groups: Array<{ id: string; title: string; username?: string; participantsCount?: number }>;
};

export function summarizeGroupsForDiscussion(result: Api.messages.TypeChats): GroupsForDiscussionSummary {
  const chats = "chats" in result ? result.chats : [];
  return {
    groups: chats.map((c) => {
      const id = `-100${c.id.toString()}`;
      const title = "title" in c ? (c as Api.Channel).title : "";
      const username = "username" in c ? ((c as Api.Channel).username ?? undefined) : undefined;
      const participantsCount =
        "participantsCount" in c ? ((c as Api.Channel).participantsCount ?? undefined) : undefined;
      return { id, title, username, participantsCount };
    }),
  };
}

// ─── Read Participants ─────────────────────────────────────────────────────

export type ReadParticipantsSummary = {
  messageId: number;
  readers: Array<{ userId: string; readAt: string }>;
  count: number;
};

export function summarizeReadParticipants(
  list: Api.TypeReadParticipantDate[],
  messageId: number,
): ReadParticipantsSummary {
  return {
    messageId,
    readers: list.map((r) => ({
      userId: (r as Api.ReadParticipantDate).userId.toString(),
      readAt: new Date((r as Api.ReadParticipantDate).date * 1000).toISOString(),
    })),
    count: list.length,
  };
}

// ─── Report Result ─────────────────────────────────────────────────────────

export type ReportResultSummary =
  | { kind: "reported" }
  | { kind: "chooseOption"; title?: string; options: Array<{ text: string; option: string }> }
  | { kind: "addComment"; optional?: boolean };

export function summarizeReportResult(result: Api.TypeReportResult): ReportResultSummary {
  if (result instanceof Api.ReportResultReported) return { kind: "reported" };
  if (result instanceof Api.ReportResultAddComment) return { kind: "addComment", optional: result.optional };
  if (result instanceof Api.ReportResultChooseOption) {
    return {
      kind: "chooseOption",
      title: result.title,
      options: (result.options ?? []).map((o) => {
        const opt = o as Api.MessageReportOption;
        return {
          text: opt.text,
          option: Buffer.from(opt.option as Uint8Array).toString("base64"),
        };
      }),
    };
  }
  throw new Error(`unknown ReportResult type: ${(result as { className?: string }).className ?? "unknown"}`);
}

// ─── Poll helpers ──────────────────────────────────────────────────────────

export type PollSummary = {
  question: string;
  isClosed: boolean;
  isQuiz: boolean;
  isMulti: boolean;
  totalVoters: number;
  options: Array<{
    index: number;
    text: string;
    votes: number;
    percent: number;
    chosen: boolean;
    correct?: boolean;
  }>;
};

export function summarizePoll(poll: Api.Poll, results?: Api.PollResults): PollSummary {
  const total = results?.totalVoters ?? 0;
  const answerResults = results?.results ?? [];

  const options = (poll.answers as Api.PollAnswer[]).map((answer, index) => {
    // Match by option bytes
    const v = answerResults.find((r) => {
      const rOpt = Buffer.from(r.option as Uint8Array);
      const aOpt = Buffer.from(answer.option as Uint8Array);
      return rOpt.equals(aOpt);
    }) as Api.PollAnswerVoters | undefined;
    const votes = v?.voters ?? 0;
    const percent = total > 0 ? Math.round((votes / total) * 1000) / 10 : 0;
    return {
      index,
      text: (answer.text as Api.TextWithEntities).text,
      votes,
      percent,
      chosen: v?.chosen ?? false,
      correct: poll.quiz ? (v?.correct ?? false) : undefined,
    };
  });

  return {
    question: (poll.question as Api.TextWithEntities).text,
    isClosed: poll.closed ?? false,
    isQuiz: poll.quiz ?? false,
    isMulti: poll.multipleChoice ?? false,
    totalVoters: total,
    options,
  };
}

export function extractPollMediaFromUpdates(
  updates: Api.TypeUpdates,
): { poll: Api.Poll; results?: Api.PollResults } | null {
  let list: Api.TypeUpdate[] = [];
  if (updates instanceof Api.Updates || updates instanceof Api.UpdatesCombined) {
    list = updates.updates;
  } else if (updates instanceof Api.UpdateShort) {
    list = [updates.update];
  }
  for (const u of list) {
    if (u instanceof Api.UpdateMessagePoll) {
      if (u.poll instanceof Api.Poll) {
        return {
          poll: u.poll,
          results: u.results instanceof Api.PollResults ? u.results : undefined,
        };
      }
    }
  }
  return null;
}

export function extractPeerId(peer: Api.TypePeer): string {
  if (peer instanceof Api.PeerUser) return peer.userId.toString();
  if (peer instanceof Api.PeerChat) return peer.chatId.toString();
  if (peer instanceof Api.PeerChannel) return peer.channelId.toString();
  return "0";
}

export function summarizeAllStories(result: Api.stories.TypeAllStories): AllStoriesSummary {
  const stealthMode = result.stealthMode
    ? {
        activeUntilDate: result.stealthMode.activeUntilDate,
        cooldownUntilDate: result.stealthMode.cooldownUntilDate,
      }
    : undefined;
  if (result instanceof Api.stories.AllStoriesNotModified) {
    return {
      modified: false,
      state: result.state,
      peerStories: [],
      stealthMode,
    };
  }
  const all = result as Api.stories.AllStories;
  const peerStories = (all.peerStories ?? [])
    .map(summarizePeerStories)
    .filter((p): p is PeerStoriesSummary => p !== null);
  return {
    modified: true,
    state: all.state,
    hasMore: all.hasMore,
    count: all.count,
    peerStories,
    stealthMode,
  };
}
