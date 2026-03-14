# slackcli

A Node.js CLI tool to send and read Slack messages from the terminal. Works with enterprise Slack workspaces without requiring admin app approval — authenticates using the Slack desktop app session.

## Features

- 📋 List your channels grouped by sidebar sections (just like the Slack app)
- 📨 Read messages from any channel
- ✉️ Send messages as yourself
- 🔔 View messages where you are mentioned
- ✅ Mark all channels as read
- 🔐 Authenticate without admin approval via desktop app token extraction

## Requirements

- Node.js 18+
- [Slack desktop app](https://slack.com/downloads) installed and logged in

## Installation

```bash
git clone https://github.com/tomek-niemczyk-vimn/slack-cli.git
cd slack-cli
npm install
```

Add a shell alias (add to `~/.bashrc` or `~/.zshrc`):

```bash
alias slackcli='node /path/to/slack-cli/index.js'
```

## Authentication

### Option 1: Import token from Slack desktop app (recommended, no admin needed)

Make sure Slack desktop app is running and logged in, then:

```bash
slackcli import-desktop-token
```

This automatically extracts the session token and saves it to `~/.slack-cli/.env`.

> **Note:** Token expires when Slack refreshes its session. Re-run `import-desktop-token` if you get auth errors.

### Option 2: OAuth via browser

1. Create a Slack App at https://api.slack.com/apps
2. Add **User Token Scopes**: `channels:history`, `channels:read`, `channels:write`, `chat:write`, `groups:history`, `groups:read`, `groups:write`, `im:history`, `im:read`, `im:write`, `mpim:history`, `mpim:read`, `mpim:write`, `search:read`, `users:read`
3. Set Redirect URL to: `https://localhost:3000/callback`
4. Copy **Client ID** and **Client Secret** to `~/.slack-cli/.env`:
   ```
   SLACK_CLIENT_ID=xxx
   SLACK_CLIENT_SECRET=yyy
   ```
5. Run:
   ```bash
   slackcli login
   ```

## Usage

```bash
# List your channels grouped by section
slackcli channels

# Read last 10 messages from a channel
slackcli read general

# Read last 30 messages
slackcli read general --limit 30

# Send a message
slackcli send general "Hello from the terminal!"

# View your mentions
slackcli mentions
slackcli mentions --limit 50

# Mark everything as read
slackcli mark-read
```

## Environment variables

Create `~/.slack-cli/.env` (see `.env.example`):

```env
# Filled automatically by import-desktop-token or login:
SLACK_TOKEN=xoxc-...
SLACK_COOKIE_D=xoxd-...

# Required only for OAuth login:
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
```

> Auth config lives outside the repo in `~/.slack-cli/.env`.

## How it works

- **Token extraction**: Reads the `xoxc-` token from Slack's LevelDB local storage and decrypts the `d` session cookie using the AES key stored in the system keyring.
- **Enterprise workspaces**: Falls back to `search.messages` and `client.counts` internal APIs when `conversations.list` is blocked by enterprise policy.
- **Sections**: Uses `users.channelSections.list` to mirror your Slack sidebar grouping.
