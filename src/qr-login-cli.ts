#!/usr/bin/env node
import "dotenv/config";
import QRCode from "qrcode";
import { IpcClient } from "./client.js";
import { TelegramService } from "./telegram-client.js";

const API_ID = Number(process.env.TELEGRAM_API_ID);
const API_HASH = process.env.TELEGRAM_API_HASH;

if (!API_ID || !API_HASH) {
  console.error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env file");
  process.exit(1);
}

async function printQr(url: string): Promise<void> {
  const terminalQr = await QRCode.toString(url, { type: "terminal", small: true });
  console.log(terminalQr);
  console.log("Waiting for scan...\n");
}

function printLoginHeader(viaDaemon: boolean): void {
  console.log(`\nStarting Telegram QR login${viaDaemon ? " (via running daemon)" : ""}...\n`);
  console.log("Scan the QR code in Telegram app:");
  console.log("  Settings > Devices > Link Desktop Device\n");
}

async function ipcLogin(): Promise<boolean> {
  const ipc = new IpcClient();
  const connected = await ipc.connect();
  if (!connected) return false;

  printLoginHeader(true);

  try {
    const result = await ipc.loginFlow((url) => {
      printQr(url).catch((err) => {
        console.error(`[mcp-telegram] Failed to render QR: ${err instanceof Error ? err.message : String(err)}`);
      });
    });
    if (result.success) {
      console.log(`Login successful!`);
      console.log(`  Account: @${result.username ?? "unknown"}\n`);
    } else {
      console.log(`Error: ${result.error ?? "unknown"}\n`);
    }
  } finally {
    ipc.destroy();
  }
  return true;
}

async function standaloneLogin(): Promise<void> {
  const telegram = new TelegramService(API_ID, API_HASH as string);

  await telegram.loadSession();
  if (await telegram.connect()) {
    const me = await telegram.getMe();
    console.log(`\nAlready connected as ${me.firstName ?? ""} (@${me.username ?? "unknown"}, id: ${me.id})\n`);
    await telegram.disconnect();
    return;
  }

  printLoginHeader(false);

  const result = await telegram.startQrLogin(
    () => {},
    async (url) => {
      await printQr(url);
    },
  );

  if (result.success) {
    console.log("Login successful!");
    const me = await telegram.getMe();
    console.log(`  Account: ${me.firstName ?? ""} (@${me.username ?? "unknown"}, id: ${me.id})\n`);
  } else {
    console.log(`Error: ${result.message}\n`);
  }

  await telegram.disconnect();
}

async function main() {
  const viaIpc = await ipcLogin();
  if (!viaIpc) await standaloneLogin();
}

main().catch(console.error);
