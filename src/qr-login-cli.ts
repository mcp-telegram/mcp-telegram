#!/usr/bin/env node
import "dotenv/config";
import QRCode from "qrcode";
import { TelegramService } from "./telegram-client.js";

const API_ID = Number(process.env.TELEGRAM_API_ID);
const API_HASH = process.env.TELEGRAM_API_HASH;

if (!API_ID || !API_HASH) {
  console.error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env file");
  process.exit(1);
}

const telegram = new TelegramService(API_ID, API_HASH);

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
    () => {},
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
