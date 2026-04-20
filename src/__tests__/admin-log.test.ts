import assert from "node:assert";
import { describe, it } from "node:test";
import type bigInt from "big-integer";
import { Api } from "telegram/tl/index.js";
import { describeAdminLogAction, describeAdminLogDetails } from "../telegram-client.js";

describe("describeAdminLogAction", () => {
  it("converts ChangeTitle to snake_case", () => {
    const action = new Api.ChannelAdminLogEventActionChangeTitle({ prevValue: "a", newValue: "b" });
    assert.strictEqual(describeAdminLogAction(action), "change_title");
  });

  it("converts ParticipantJoin to snake_case", () => {
    const action = new Api.ChannelAdminLogEventActionParticipantJoin();
    assert.strictEqual(describeAdminLogAction(action), "participant_join");
  });

  it("handles ToggleSlowMode", () => {
    const action = new Api.ChannelAdminLogEventActionToggleSlowMode({ prevValue: 0, newValue: 30 });
    assert.strictEqual(describeAdminLogAction(action), "toggle_slow_mode");
  });

  it("handles ChangeHistoryTTL without splitting acronym", () => {
    const action = new Api.ChannelAdminLogEventActionChangeHistoryTTL({ prevValue: 0, newValue: 86400 });
    assert.strictEqual(describeAdminLogAction(action), "change_history_ttl");
  });
});

describe("describeAdminLogDetails", () => {
  const describeUser = (id: bigInt.BigInteger) => `user_${id.toString()}`;

  it("formats title change", () => {
    const action = new Api.ChannelAdminLogEventActionChangeTitle({ prevValue: "old", newValue: "new" });
    assert.strictEqual(describeAdminLogDetails(action, describeUser), '"old" → "new"');
  });

  it("formats username change", () => {
    const action = new Api.ChannelAdminLogEventActionChangeUsername({ prevValue: "old", newValue: "new" });
    assert.strictEqual(describeAdminLogDetails(action, describeUser), "@old → @new");
  });

  it("formats slow mode change", () => {
    const action = new Api.ChannelAdminLogEventActionToggleSlowMode({ prevValue: 0, newValue: 30 });
    assert.strictEqual(describeAdminLogDetails(action, describeUser), "0s → 30s");
  });

  it("returns empty string for unknown actions", () => {
    const action = new Api.ChannelAdminLogEventActionParticipantJoin();
    assert.strictEqual(describeAdminLogDetails(action, describeUser), "");
  });
});
