#!/usr/bin/env npx tsx
import "dotenv/config";
import { exec } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { TelegramService } from "./telegram-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const QR_IMAGE_PATH = join(__dirname, "..", "qr-login.png");

const API_ID = Number(process.env.TELEGRAM_API_ID);
const API_HASH = process.env.TELEGRAM_API_HASH;

if (!API_ID || !API_HASH) {
  console.error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env file");
  process.exit(1);
}

const telegram = new TelegramService(API_ID, API_HASH);

function openFile(path: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${path}"`);
}

async function main() {
  // Check if already connected
  await telegram.loadSession();
  if (await telegram.connect()) {
    const me = await telegram.getMe();
    console.log(`\nAlready connected as ${me.firstName ?? ""} (@${me.username ?? "unknown"}, id: ${me.id})\n`);
    await telegram.disconnect();
    return;
  }

  console.log("\nStarting Telegram QR login...\n");
  console.log("Scan the QR code in Telegram app:");
  console.log("  Settings > Devices > Link Desktop Device\n");

  const result = await telegram.startQrLogin(
    // onQrDataUrl — save as PNG and open
    async (dataUrl) => {
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      await writeFile(QR_IMAGE_PATH, Buffer.from(base64, "base64"));
      console.log(`QR saved: ${QR_IMAGE_PATH}`);
      openFile(QR_IMAGE_PATH);
    },
    // onQrUrl — also show in terminal
    async (url) => {
      const terminalQr = await QRCode.toString(url, { type: "terminal", small: true });
      console.log(terminalQr);
      console.log("Waiting for scan...\n");
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

main().catch(console.error);
