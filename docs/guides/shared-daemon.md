# Shared daemon (serve mode)

By default each MCP client (each Claude Code window) launches its own `mcp-telegram` process,
and each opens the **same** Telegram session file. Telegram allows only one live connection per
session, so a second process evicts the first with `AUTH_KEY_DUPLICATED` — multiple windows end
up fighting over the connection.

**Serve mode** fixes this. One persistent daemon owns the single Telegram connection and listens
on a Unix socket; every other process becomes a thin **client** that proxies tool calls to it over
that socket. Many windows then share one connection safely, and closing any window never drops the
connection.

```
window 1 ── ssh ─┐
window 2 ── ssh ─┼─→  mcp-telegram (client) ──┐
window 3 ── ssh ─┘                            │  Unix socket
                                              ▼  /…/daemon.sock
                              mcp-telegram serve (daemon, systemd)
                                              │
                                              ▼  single MTProto connection
                                          Telegram
```

## How mode is selected

`src/index.ts` dispatches at startup:

- `mcp-telegram serve` (or env `MCP_TELEGRAM_DAEMON=1`) → **daemon** (`runServe`): owns the
  connection, listens on the socket, no stdio attached, runs until `SIGTERM`.
- otherwise it calls `tryAcquireLock()`:
  - lock acquired → **master** (`runMaster`): owns the connection **and** serves the launching
    window over stdio (the single-window / no-daemon path).
  - lock held by a daemon/master → **client** (`runClient`): serves its window over stdio and
    proxies every tool call to the owner via the IPC socket.

The socket and lock live next to the session file:
`dirname(TELEGRAM_SESSION_PATH)/daemon.sock` and `…/daemon.lock`.

Internally `runMaster` and `runServe` share one `startOwner()` core (socket server + IPC dispatch
+ auto-connect + graceful shutdown); serve mode is that core without a stdio transport.

## Server setup (systemd)

Templates ship in [`packaging/`](https://github.com/mcp-telegram/mcp-telegram/tree/main/packaging) in the repository.

```bash
# 1. Build
npm ci && npm run build           # produces dist/

# 2. Credentials server-side (clients won't need them)
cp packaging/mcp-telegram.env.example /etc/mcp-telegram.env
#   fill TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION_PATH
chmod 600 /etc/mcp-telegram.env

# 3. systemd unit (adjust the node + dist path in ExecStart)
cp packaging/mcp-telegram.service /etc/systemd/system/mcp-telegram.service
systemctl daemon-reload
systemctl enable --now mcp-telegram

# 4. Verify
systemctl status mcp-telegram
journalctl -u mcp-telegram -n 30   # expect "[serve] connected as @…"
```

The session file must already be authenticated (run `mcp-telegram login` once before starting the
daemon). The daemon loads it on boot; it never logs in interactively per request.

## Client setup

Point the MCP server command at the same build; it becomes a client automatically because the
daemon holds the lock. Credentials are optional for clients (only the daemon needs them). Over SSH:

```jsonc
// MCP client config (e.g. ~/.claude.json → mcpServers.telegram)
{
  "command": "ssh",
  "args": [
    "-T", "-o", "BatchMode=yes",
    "user@host",
    "TELEGRAM_SESSION_PATH=/path/to/session node /path/to/dist/cli.js"
  ]
}
```

`TELEGRAM_SESSION_PATH` is required so the client resolves the daemon's socket path. Avoid
redirecting the remote command's stderr to `/dev/null` — that hides the diagnostics you need when
something breaks.

## Observability

The daemon logs to stderr (captured by journald):

- `[serve] connected as @…` — the single connection is up.
- `[serve] client connected` / `client disconnected` — a client attached / detached.

A client disconnect tears down only that client's session; the daemon and other clients are
untouched.

## Rollback

Serve mode is additive — the master/client and one-shot stdio modes are unchanged.

```bash
# client side: restore the previous command in your MCP config (a one-line revert)
# server side:
systemctl disable --now mcp-telegram
```

With the daemon stopped, the next client to start acquires the lock and becomes a master again
(single-window behaviour).
