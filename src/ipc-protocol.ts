/** MCP SDK internal tool registry — field name "handler" confirmed in SDK v1.29.0 */
export type McpRegisteredTool = {
  handler: (args: Record<string, unknown>, extra: Record<string, unknown>) => Promise<unknown>;
};
export interface McpServerInternal {
  _registeredTools: Record<string, McpRegisteredTool>;
}

/** Request from Client → Master */
export interface IpcRequest {
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

/** Response from Master → Client */
export interface IpcResponse {
  id: string;
  result?: unknown;
  error?: string;
}

/** Encode a message as newline-delimited JSON */
export function encodeMessage(msg: IpcRequest | IpcResponse): string {
  return `${JSON.stringify(msg)}\n`;
}

/** Parse newline-delimited JSON messages from a buffer, returns parsed messages + leftover */
export function parseMessages(buf: string): { messages: (IpcRequest | IpcResponse)[]; remaining: string } {
  const lines = buf.split("\n");
  const remaining = lines.pop() ?? "";
  const messages: (IpcRequest | IpcResponse)[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      messages.push(JSON.parse(trimmed) as IpcRequest | IpcResponse);
    } catch {
      // Skip malformed lines
    }
  }
  return { messages, remaining };
}
