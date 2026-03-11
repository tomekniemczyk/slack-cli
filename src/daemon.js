'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const { getClient } = require('./client');
const { resolveChannelId } = require('./read');
const { replyToMessage } = require('./reply');
const { askAgent, askAgentWithHistory, appendHistory } = require('./agent');

const STATE_FILE = path.join(process.env.HOME, '.slack-agent-state.json');
const POLL_INTERVAL_MS = 10000;

// ── State helpers ─────────────────────────────────────────────────────────────

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { channels: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── PR detection & fetch ──────────────────────────────────────────────────────

function detectPRLinks(text) {
  const re = /https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)/g;
  const found = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    found.push({ url: m[0], repo: m[1], number: m[2] });
  }
  return found;
}

function fetchPRContext(repo, prNumber) {
  try {
    const infoJson = execSync(
      `gh pr view ${prNumber} --repo ${repo} --json title,body,author,additions,deletions`,
      { encoding: 'utf8', timeout: 30000 }
    );
    const diff = execSync(`gh pr diff ${prNumber} --repo ${repo}`, {
      encoding: 'utf8',
      timeout: 30000,
    });
    return { info: JSON.parse(infoJson), diff: diff.slice(0, 10000) };
  } catch {
    return null;
  }
}

// ── Terminal helpers ──────────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function hr() {
  return '─'.repeat(60);
}

function formatTs(ts) {
  return new Date(parseFloat(ts) * 1000).toLocaleString('pl-PL');
}

// ── Message processor ─────────────────────────────────────────────────────────

async function processMessage(msg, channelName, channelId) {
  console.log(`\n${hr()}`);
  console.log(`📬 \x1b[1m#${channelName}\x1b[0m  od \x1b[1m${msg.user}\x1b[0m  \x1b[2m${formatTs(msg.ts)}\x1b[0m`);
  console.log(`\n  ${msg.text}\n`);

  const prLinks = detectPRLinks(msg.text);
  let proposal;

  if (prLinks.length > 0) {
    const pr = prLinks[0];
    console.log(`🔍 Wykryto PR: ${pr.url}`);
    process.stdout.write(`⏳ Pobieranie diff z GitHub...`);
    const prCtx = fetchPRContext(pr.repo, pr.number);
    process.stdout.write('\r\x1b[K');

    if (prCtx) {
      process.stdout.write(`🤖 Generuję code review (z historią kanału)...`);
      const extraContext = [
        'You are a senior software engineer doing a thorough code review.',
        'Focus on: bugs, security issues, performance, readability, and best practices.',
        'Be specific and actionable. Format as a Slack message with bullet points.',
        '',
        `PR: ${prCtx.info.title}`,
        `Author: ${prCtx.info.author?.login ?? 'unknown'}`,
        `Description: ${prCtx.info.body || 'No description'}`,
        `Changes: +${prCtx.info.additions} / -${prCtx.info.deletions} lines`,
        '',
        'Diff (truncated to 10k chars):',
        prCtx.diff,
      ].join('\n');

      proposal = askAgentWithHistory(channelId, channelName, msg, extraContext);
      process.stdout.write('\r\x1b[K');
    }
  }

  if (!proposal) {
    process.stdout.write(`🤖 Generuję odpowiedź (z historią kanału)...`);
    proposal = askAgentWithHistory(channelId, channelName, msg);
    process.stdout.write('\r\x1b[K');
  }

  console.log(`\x1b[1m🤖 Proponowana odpowiedź:\x1b[0m`);
  console.log(`\x1b[36m${proposal}\x1b[0m\n`);

  const answer = await ask(`[y] Wyślij  [n] Pomiń  [e] Edytuj  [s] Stop daemon > `);

  if (answer === 'y' || answer === 'Y') {
    await replyToMessage(channelId, msg.ts, proposal);
    // Record sent reply to history
    appendHistory(channelId, { role: 'sent', user: 'you', text: proposal, ts: String(Date.now() / 1000) });
    console.log(`✅ Wysłano!`);
  } else if (answer === 'e' || answer === 'E') {
    const custom = await ask(`Twoja wiadomość: `);
    if (custom) {
      await replyToMessage(channelId, msg.ts, custom);
      appendHistory(channelId, { role: 'sent', user: 'you', text: custom, ts: String(Date.now() / 1000) });
      console.log(`✅ Wysłano!`);
    } else {
      console.log(`⏭️  Pominięto (brak tekstu)`);
    }
  } else if (answer === 's' || answer === 'S') {
    return 'stop';
  } else {
    console.log(`⏭️  Pominięto`);
  }

  return 'continue';
}

// ── Poller ────────────────────────────────────────────────────────────────────

async function pollChannel(client, channelId, channelName, state, myUserId) {
  const oldest = state.channels[channelId] ?? String(Date.now() / 1000 - 60);

  try {
    const result = await client.conversations.history({
      channel: channelId,
      oldest,
      limit: 20,
    });

    const msgs = (result.messages ?? [])
      .filter((m) => m.user && m.user !== myUserId && !m.bot_id && !m.subtype)
      .reverse();

    if (msgs.length > 0) {
      state.channels[channelId] = msgs[msgs.length - 1].ts;
      saveState(state);
    }

    return msgs;
  } catch (err) {
    const ignore = ['not_in_channel', 'channel_not_found', 'missing_scope'];
    if (!ignore.some((s) => err.message?.includes(s))) {
      console.error(`\n⚠️  Poll #${channelName}: ${err.message}`);
    }
    return [];
  }
}

// ── Main daemon ───────────────────────────────────────────────────────────────

async function startDaemon(channelNames, options = {}) {
  const pollInterval = (options.interval ?? 10) * 1000;
  const state = loadState();
  const client = getClient();

  const authInfo = await client.auth.test();
  const myUserId = authInfo.user_id;

  console.log(`\n🤖 \x1b[1mSlack Agent\x1b[0m uruchomiony`);
  console.log(`👤 Zalogowany jako: \x1b[1m${authInfo.user}\x1b[0m`);
  console.log(`📡 Kanały: \x1b[1m${channelNames.join(', ')}\x1b[0m`);
  console.log(`⏰ Polling co ${pollInterval / 1000}s  •  Ctrl+C aby zatrzymać`);
  console.log(hr());

  // Resolve channel IDs once
  const channels = [];
  for (const name of channelNames) {
    try {
      const id = await resolveChannelId(name);
      channels.push({ id, name });
      if (!state.channels[id]) {
        state.channels[id] = String(Date.now() / 1000);
      }
    } catch {
      console.error(`⚠️  Nieznany kanał: ${name}`);
    }
  }
  saveState(state);

  if (channels.length === 0) {
    console.error('❌ Brak poprawnych kanałów. Zatrzymuję.');
    process.exit(1);
  }

  let running = true;
  process.on('SIGINT', () => {
    console.log('\n\n👋 Agent zatrzymany');
    running = false;
    process.exit(0);
  });

  while (running) {
    // Collect all new messages from all channels
    const queue = [];
    for (const ch of channels) {
      const msgs = await pollChannel(client, ch.id, ch.name, state, myUserId);
      for (const msg of msgs) queue.push({ msg, channelId: ch.id, channelName: ch.name });
    }

    // Process queue interactively
    for (const item of queue) {
      if (!running) break;
      const result = await processMessage(item.msg, item.channelName, item.channelId);
      if (result === 'stop') {
        running = false;
        break;
      }
    }

    if (running) {
      const next = new Date(Date.now() + pollInterval).toLocaleTimeString('pl-PL');
      process.stdout.write(`\r\x1b[2m⏳ Czekam... następne sprawdzenie o ${next}  (Ctrl+C stop)\x1b[0m`);
      await new Promise((r) => setTimeout(r, pollInterval));
      process.stdout.write('\r\x1b[K');
    }
  }
}

module.exports = { startDaemon };
