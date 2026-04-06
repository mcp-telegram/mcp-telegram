# Get Telegram API Credentials

Before using MCP Telegram, you need an **API ID** and **API Hash** from Telegram. This is free and takes about 2 minutes.

## Step by Step

### 1. Go to my.telegram.org

Open [my.telegram.org](https://my.telegram.org) in your browser and log in with your phone number (including country code, e.g. `+1234567890`).

### 2. Navigate to API Development Tools

After logging in, click **"API development tools"**.

### 3. Create an Application

Fill in the form:
- **App title** — anything (e.g. "My MCP")
- **Short name** — anything (e.g. "mymcp")
- **Platform** — choose any (doesn't matter)
- **Description** — leave empty or write anything

Click **Create application**.

### 4. Copy Your Credentials

You'll see two values:
- **App api_id** — a number like `12345678`
- **App api_hash** — a string like `a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`

Save these — you'll need them for installation and login.

::: tip
These credentials identify your app to Telegram. They are **not** your login — you'll authenticate separately via QR code.
:::

::: warning
Keep your API credentials private. Don't commit them to public repos. Use environment variables.
:::

## Next Step

→ [Install MCP Telegram](/getting-started/installation)
