import assert from "node:assert";
import { describe, it } from "node:test";
import bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { extractPeerId, extractPollMediaFromUpdates, summarizePoll, TelegramService } from "../telegram-client.js";

// ─── Mock helpers ─────────────────────────────────────────────────────────────

interface Internals {
  client: unknown;
  connected: boolean;
}

type FakeInvoke = (req: unknown) => unknown;

function makeService(
  invocations: unknown[],
  invoke: FakeInvoke,
  getMessages?: (peer: unknown, opts: unknown) => unknown,
): TelegramService {
  const fakeClient = {
    invoke: async (req: unknown) => {
      invocations.push(req);
      return invoke(req);
    },
    getMessages: async (peer: unknown, opts: unknown) => {
      if (getMessages) return getMessages(peer, opts);
      return [];
    },
  };
  const service = new TelegramService(1, "hash");
  const internals = service as unknown as Internals;
  internals.client = fakeClient;
  internals.connected = true;
  return service;
}

// Build minimal poll objects for testing
function makePoll(opts: {
  question?: string;
  answers?: string[];
  closed?: boolean;
  quiz?: boolean;
  multipleChoice?: boolean;
}): Api.Poll {
  const answers = (opts.answers ?? ["A", "B"]).map(
    (text, i) =>
      new Api.PollAnswer({
        text: new Api.TextWithEntities({ text, entities: [] }),
        option: Buffer.from([i]),
      }),
  );
  return new Api.Poll({
    id: bigInt(1),
    question: new Api.TextWithEntities({ text: opts.question ?? "Test?", entities: [] }),
    answers,
    closed: opts.closed ?? false,
    quiz: opts.quiz ?? false,
    multipleChoice: opts.multipleChoice ?? false,
  });
}

function makeResults(
  votes: Array<{ option: number; voters: number; chosen?: boolean; correct?: boolean }>,
  total: number,
): Api.PollResults {
  return new Api.PollResults({
    results: votes.map(
      (v) =>
        new Api.PollAnswerVoters({
          option: Buffer.from([v.option]),
          voters: v.voters,
          chosen: v.chosen ?? false,
          correct: v.correct ?? false,
        }),
    ),
    totalVoters: total,
  });
}

// ─── summarizePoll ────────────────────────────────────────────────────────────

describe("summarizePoll", () => {
  it("returns basic poll summary with percentages", () => {
    const poll = makePoll({ question: "Favourite?", answers: ["A", "B", "C"] });
    const results = makeResults(
      [
        { option: 0, voters: 5, chosen: true },
        { option: 1, voters: 3 },
        { option: 2, voters: 2 },
      ],
      10,
    );
    const summary = summarizePoll(poll, results);
    assert.strictEqual(summary.question, "Favourite?");
    assert.strictEqual(summary.isClosed, false);
    assert.strictEqual(summary.isQuiz, false);
    assert.strictEqual(summary.isMulti, false);
    assert.strictEqual(summary.totalVoters, 10);
    assert.strictEqual(summary.options.length, 3);
    assert.strictEqual(summary.options[0].text, "A");
    assert.strictEqual(summary.options[0].votes, 5);
    assert.strictEqual(summary.options[0].percent, 50);
    assert.strictEqual(summary.options[0].chosen, true);
    assert.strictEqual(summary.options[1].votes, 3);
    assert.strictEqual(summary.options[1].percent, 30);
  });

  it("marks correct answer in quiz poll", () => {
    const poll = makePoll({ answers: ["Yes", "No"], quiz: true });
    const results = makeResults(
      [
        { option: 0, voters: 7, correct: true },
        { option: 1, voters: 3 },
      ],
      10,
    );
    const summary = summarizePoll(poll, results);
    assert.strictEqual(summary.isQuiz, true);
    assert.strictEqual(summary.options[0].correct, true);
    assert.strictEqual(summary.options[1].correct, false);
  });

  it("sets isMulti for multi-choice poll", () => {
    const poll = makePoll({ answers: ["X", "Y"], multipleChoice: true });
    const summary = summarizePoll(poll);
    assert.strictEqual(summary.isMulti, true);
  });

  it("returns percent=0 when no voters (no division by zero)", () => {
    const poll = makePoll({ answers: ["A", "B"] });
    const results = makeResults(
      [
        { option: 0, voters: 0 },
        { option: 1, voters: 0 },
      ],
      0,
    );
    const summary = summarizePoll(poll, results);
    assert.strictEqual(summary.totalVoters, 0);
    assert.strictEqual(summary.options[0].percent, 0);
    assert.strictEqual(summary.options[1].percent, 0);
  });

  it("returns 0 voters when no results provided", () => {
    const poll = makePoll({ answers: ["A"] });
    const summary = summarizePoll(poll);
    assert.strictEqual(summary.totalVoters, 0);
    assert.strictEqual(summary.options[0].votes, 0);
    assert.strictEqual(summary.options[0].percent, 0);
  });

  it("marks closed poll as isClosed=true", () => {
    const poll = makePoll({ closed: true });
    const summary = summarizePoll(poll);
    assert.strictEqual(summary.isClosed, true);
  });

  it("correct is undefined for non-quiz poll", () => {
    const poll = makePoll({ answers: ["A"], quiz: false });
    const results = makeResults([{ option: 0, voters: 1 }], 1);
    const summary = summarizePoll(poll, results);
    assert.strictEqual(summary.options[0].correct, undefined);
  });
});

// ─── extractPollMediaFromUpdates ──────────────────────────────────────────────

describe("extractPollMediaFromUpdates", () => {
  it("returns poll+results from Updates with UpdateMessagePoll", () => {
    const poll = makePoll({ question: "Q?" });
    const results = makeResults([{ option: 0, voters: 2 }], 2);
    const updates = new Api.Updates({
      updates: [new Api.UpdateMessagePoll({ pollId: bigInt(1), poll, results })],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });
    const out = extractPollMediaFromUpdates(updates);
    assert.ok(out);
    assert.strictEqual((out.poll.question as Api.TextWithEntities).text, "Q?");
    assert.ok(out.results);
  });

  it("returns null when no UpdateMessagePoll in updates", () => {
    const updates = new Api.Updates({
      updates: [new Api.UpdateMessageID({ id: 1, randomId: bigInt(0) })],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });
    const out = extractPollMediaFromUpdates(updates);
    assert.strictEqual(out, null);
  });

  it("handles UpdatesCombined", () => {
    const poll = makePoll({ question: "Combined?" });
    const results = makeResults([], 0);
    const updates = new Api.UpdatesCombined({
      updates: [new Api.UpdateMessagePoll({ pollId: bigInt(2), poll, results })],
      users: [],
      chats: [],
      date: 0,
      seqStart: 1,
      seq: 2,
    });
    const out = extractPollMediaFromUpdates(updates);
    assert.ok(out);
    assert.strictEqual((out.poll.question as Api.TextWithEntities).text, "Combined?");
  });
});

// ─── extractPeerId ────────────────────────────────────────────────────────────

describe("extractPeerId", () => {
  it("extracts userId for PeerUser", () => {
    const peer = new Api.PeerUser({ userId: bigInt(123) });
    assert.strictEqual(extractPeerId(peer), "123");
  });

  it("extracts chatId for PeerChat", () => {
    const peer = new Api.PeerChat({ chatId: bigInt(456) });
    assert.strictEqual(extractPeerId(peer), "456");
  });

  it("extracts channelId for PeerChannel", () => {
    const peer = new Api.PeerChannel({ channelId: bigInt(789) });
    assert.strictEqual(extractPeerId(peer), "789");
  });
});

// ─── TelegramService.sendPollVote ─────────────────────────────────────────────

describe("TelegramService.sendPollVote", () => {
  it("calls SendVote with correct options bytes", async () => {
    const invocations: unknown[] = [];
    const poll = makePoll({ answers: ["Yes", "No"] });
    const results = makeResults([{ option: 0, voters: 1, chosen: true }], 1);
    const updates = new Api.Updates({
      updates: [new Api.UpdateMessagePoll({ pollId: bigInt(1), poll, results })],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });
    const service = makeService(invocations, () => updates);
    const result = await service.sendPollVote("@chat", 42, [0]);
    assert.strictEqual(result.totalVoters, 1);
    assert.deepStrictEqual(result.chosenLabels, ["Yes"]);
    assert.strictEqual(result.isRetracted, false);
    const req = invocations[0] as { className: string; options: Buffer[] };
    assert.strictEqual(req.className, "messages.SendVote");
    assert.strictEqual(req.options.length, 1);
    assert.strictEqual(req.options[0][0], 0);
  });

  it("sends empty options array to retract vote", async () => {
    const invocations: unknown[] = [];
    const updates = new Api.Updates({
      updates: [],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });
    const service = makeService(invocations, () => updates);
    const result = await service.sendPollVote("@chat", 10, []);
    assert.strictEqual(result.isRetracted, true);
    assert.deepStrictEqual(result.chosenLabels, []);
    const req = invocations[0] as { className: string; options: unknown[] };
    assert.strictEqual(req.options.length, 0);
  });
});

// ─── TelegramService.closePoll ────────────────────────────────────────────────

describe("TelegramService.closePoll", () => {
  it("fetches message then edits with closed poll", async () => {
    const invocations: unknown[] = [];
    const poll = makePoll({ answers: ["Yes", "No"], quiz: false, multipleChoice: false });
    const pollResults = makeResults([{ option: 0, voters: 3 }], 3);
    const fakePollMedia = new Api.MessageMediaPoll({ poll, results: pollResults });
    const fakeMsg = new Api.Message({
      id: 55,
      peerId: new Api.PeerChannel({ channelId: bigInt(100) }),
      date: 0,
      media: fakePollMedia,
      message: "",
    });

    const updatedResults = makeResults([{ option: 0, voters: 3 }], 3);
    const updatesAfterEdit = new Api.Updates({
      updates: [new Api.UpdateMessagePoll({ pollId: poll.id, poll, results: updatedResults })],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });

    const service = makeService(
      invocations,
      () => updatesAfterEdit,
      () => [fakeMsg],
    );

    const result = await service.closePoll("@chat", 55);
    assert.strictEqual(result.totalVoters, 3);

    // Should have called EditMessage
    const editInvocation = invocations.find(
      (r) => (r as { className?: string }).className === "messages.EditMessage",
    ) as { className: string; media?: { poll?: Api.Poll } } | undefined;
    assert.ok(editInvocation, "EditMessage should be called");
    assert.strictEqual(editInvocation.media?.poll?.closed, true);
  });

  it("throws when message is not a poll", async () => {
    const invocations: unknown[] = [];
    const fakeMsg = new Api.Message({
      id: 1,
      peerId: new Api.PeerUser({ userId: bigInt(1) }),
      date: 0,
      message: "not a poll",
    });
    const service = makeService(
      invocations,
      () => new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
      () => [fakeMsg],
    );
    await assert.rejects(service.closePoll("@chat", 1), /not a poll/i);
  });
});

// ─── TelegramService.transcribeAudio ─────────────────────────────────────────

describe("TelegramService.transcribeAudio", () => {
  it("returns transcriptionId as string", async () => {
    const invocations: unknown[] = [];
    const fakeResult = new Api.messages.TranscribedAudio({
      transcriptionId: bigInt("9876543210"),
      text: "Hello world",
      pending: false,
    });
    const service = makeService(invocations, () => fakeResult);
    const result = await service.transcribeAudio("@chat", 1);
    assert.strictEqual(result.transcriptionId, "9876543210");
    assert.strictEqual(result.text, "Hello world");
    assert.strictEqual(result.pending, false);
  });

  it("returns pending=true when transcription is in progress", async () => {
    const invocations: unknown[] = [];
    const fakeResult = new Api.messages.TranscribedAudio({
      transcriptionId: bigInt("111"),
      text: "",
      pending: true,
      trialRemainsNum: 2,
    });
    const service = makeService(invocations, () => fakeResult);
    const result = await service.transcribeAudio("@chat", 2);
    assert.strictEqual(result.pending, true);
    assert.strictEqual(result.trialRemainsNum, 2);
  });

  it("includes trialRemainsNum when present", async () => {
    const invocations: unknown[] = [];
    const fakeResult = new Api.messages.TranscribedAudio({
      transcriptionId: bigInt("222"),
      text: "test",
      pending: false,
      trialRemainsNum: 5,
    });
    const service = makeService(invocations, () => fakeResult);
    const result = await service.transcribeAudio("@chat", 3);
    assert.strictEqual(result.trialRemainsNum, 5);
  });
});

// ─── TelegramService.rateTranscription ───────────────────────────────────────

describe("TelegramService.rateTranscription", () => {
  it("invokes RateTranscribedAudio with correct args", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => true);
    await service.rateTranscription("@chat", 5, "9876543210", true);
    const req = invocations[0] as { className: string; transcriptionId: bigInt.BigInteger; good: boolean };
    assert.strictEqual(req.className, "messages.RateTranscribedAudio");
    assert.strictEqual(req.transcriptionId.toString(), "9876543210");
    assert.strictEqual(req.good, true);
  });

  it("passes good=false for poor rating", async () => {
    const invocations: unknown[] = [];
    const service = makeService(invocations, () => true);
    await service.rateTranscription("@chat", 5, "111", false);
    const req = invocations[0] as { good: boolean };
    assert.strictEqual(req.good, false);
  });
});

// ─── TelegramService.getFactCheck ────────────────────────────────────────────

describe("TelegramService.getFactCheck", () => {
  it("returns array with matched messageIds", async () => {
    const invocations: unknown[] = [];
    const fc1 = new Api.FactCheck({
      needCheck: true,
      country: "US",
      text: new Api.TextWithEntities({ text: "This is false", entities: [] }),
      hash: bigInt(42),
    });
    const fc2 = new Api.FactCheck({ needCheck: false, hash: bigInt(0) });
    const service = makeService(invocations, () => [fc1, fc2]);
    const result = await service.getFactCheck("@chat", [10, 20]);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].messageId, 10);
    assert.strictEqual(result[0].needCheck, true);
    assert.strictEqual(result[0].country, "US");
    assert.strictEqual(result[0].text, "This is false");
    assert.strictEqual(result[0].hash, "42");
    assert.strictEqual(result[1].messageId, 20);
    assert.strictEqual(result[1].needCheck, false);
  });

  it("returns text=undefined when no text in FactCheck", async () => {
    const invocations: unknown[] = [];
    const fc = new Api.FactCheck({ needCheck: false, hash: bigInt(0) });
    const service = makeService(invocations, () => [fc]);
    const result = await service.getFactCheck("@chat", [5]);
    assert.strictEqual(result[0].text, undefined);
  });
});

// ─── TelegramService.sendPaidReaction ────────────────────────────────────────

describe("TelegramService.sendPaidReaction", () => {
  it("does not set private param when opts.private is undefined", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () => new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
    );
    await service.sendPaidReaction("@chat", 1, 5);
    const req = invocations[0] as Record<string, unknown>;
    // GramJS class may have the property defined but set to undefined when not passed
    assert.ok(!("private" in req) || req.private === undefined, "private should not be truthy when not specified");
  });

  it("sets private=true when specified", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () => new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
    );
    await service.sendPaidReaction("@chat", 1, 3, { private: true });
    const req = invocations[0] as Record<string, unknown>;
    assert.strictEqual(req.private, true);
  });

  it("sets private=false when explicitly public", async () => {
    const invocations: unknown[] = [];
    const service = makeService(
      invocations,
      () => new Api.Updates({ updates: [], users: [], chats: [], date: 0, seq: 0 }),
    );
    await service.sendPaidReaction("@chat", 1, 1, { private: false });
    const req = invocations[0] as Record<string, unknown>;
    assert.strictEqual(req.private, false);
  });
});

// ─── TelegramService.getPaidReactionPrivacy ───────────────────────────────────

describe("TelegramService.getPaidReactionPrivacy", () => {
  it("returns private=true from UpdatePaidReactionPrivacy", async () => {
    const invocations: unknown[] = [];
    const update = new Api.UpdatePaidReactionPrivacy({ private: true });
    const updates = new Api.Updates({
      updates: [update],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });
    const service = makeService(invocations, () => updates);
    const result = await service.getPaidReactionPrivacy();
    assert.strictEqual(result.private, true);
  });

  it("returns private=false when no UpdatePaidReactionPrivacy in updates", async () => {
    const invocations: unknown[] = [];
    const updates = new Api.Updates({
      updates: [],
      users: [],
      chats: [],
      date: 0,
      seq: 0,
    });
    const service = makeService(invocations, () => updates);
    const result = await service.getPaidReactionPrivacy();
    assert.strictEqual(result.private, false);
  });
});
