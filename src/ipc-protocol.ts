/** MCP SDK internal tool registry — field name "handler" confirmed in SDK v1.29.0 */
export type McpRegisteredTool = {
  handler: (args: Record<string, unknown>, extra: Record<string, unknown>) => Promise<unknown>;
};
export interface McpServerInternal {
  _registeredTools: Record<string, McpRegisteredTool>;
}

/** Client → Master: invoke MCP tool */
export interface IpcToolRequest {
  type: "tool";
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

/** Master → Client: tool result */
export interface IpcToolResponse {
  type: "tool_response";
  id: string;
  result?: unknown;
  error?: string;
}

/** Client → Master: begin QR login flow */
export interface IpcLoginStart {
  type: "login_start";
  id: string;
}

/** Master → Client: QR code URL to display (may fire multiple times as URL refreshes) */
export interface IpcLoginQr {
  type: "login_qr";
  id: string;
  url: string;
}

/** Master → Client: QR login finished */
export interface IpcLoginDone {
  type: "login_done";
  id: string;
  success: boolean;
  username?: string;
  error?: string;
}

export type IpcMessage = IpcToolRequest | IpcToolResponse | IpcLoginStart | IpcLoginQr | IpcLoginDone;

/** Encode a message as newline-delimited JSON */
export function encodeMessage(msg: IpcMessage): string {
  return `${JSON.stringify(msg)}\n`;
}

/** Parse newline-delimited JSON messages from a buffer, returns parsed messages + leftover */
export function parseMessages(buf: string): { messages: IpcMessage[]; remaining: string } {
  const lines = buf.split("\n");
  const remaining = lines.pop() ?? "";
  const messages: IpcMessage[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<IpcMessage>;
      if (isIpcMessage(parsed)) messages.push(parsed);
    } catch {
      // Skip malformed lines
    }
  }
  return { messages, remaining };
}

function isIpcMessage(m: Partial<IpcMessage>): m is IpcMessage {
  if (!m || typeof m !== "object" || typeof m.type !== "string" || typeof m.id !== "string") return false;
  return (
    m.type === "tool" ||
    m.type === "tool_response" ||
    m.type === "login_start" ||
    m.type === "login_qr" ||
    m.type === "login_done"
  );
}
