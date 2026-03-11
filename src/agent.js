'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONV_DIR = path.join(process.env.HOME, '.slack-agent-conversations');
const MAX_HISTORY = 30; // max messages kept per channel
const CONTEXT_WINDOW = 20; // messages passed to agent per request

const NOISE_PATTERNS = [
  /^Total usage est:/,
  /^API time spent:/,
  /^Total session time:/,
  /^Total code changes:/,
  /^Breakdown by AI model:/,
  /^(claude|gpt)-/,
];

// ── History persistence ───────────────────────────────────────────────────────

function historyFile(channelId) {
  fs.mkdirSync(CONV_DIR, { recursive: true });
  return path.join(CONV_DIR, `${channelId}.json`);
}

function loadHistory(channelId) {
  try {
    return JSON.parse(fs.readFileSync(historyFile(channelId), 'utf8'));
  } catch {
    return [];
  }
}

function saveHistory(channelId, history) {
  const trimmed = history.slice(-MAX_HISTORY);
  fs.writeFileSync(historyFile(channelId), JSON.stringify(trimmed, null, 2));
  return trimmed;
}

function appendHistory(channelId, entry) {
  const history = loadHistory(channelId);
  history.push(entry);
  return saveHistory(channelId, history);
}

// ── Output cleanup ────────────────────────────────────────────────────────────

function cleanOutput(raw) {
  const lines = raw.split('\n');
  const result = [];
  let trailingBlanks = 0;

  for (const line of lines) {
    if (NOISE_PATTERNS.some((p) => p.test(line))) continue;
    if (line.trim() === '') {
      trailingBlanks++;
      if (trailingBlanks <= 1) result.push(line);
    } else {
      trailingBlanks = 0;
      result.push(line);
    }
  }

  return result.join('\n').trim();
}

// ── Format history as readable context block ──────────────────────────────────

function formatHistory(history) {
  if (!history.length) return '';
  return history
    .map((e) => {
      if (e.role === 'assistant') return `[you/AI] ${e.text}`;
      return `[${e.user ?? 'unknown'}] ${e.text}`;
    })
    .join('\n');
}

// ── Main agent call ───────────────────────────────────────────────────────────

function askAgent(prompt) {
  const output = execSync(`gh copilot -p ${JSON.stringify(prompt)}`, {
    encoding: 'utf8',
    timeout: 90000,
    env: { ...process.env },
  });
  return cleanOutput(output);
}

/**
 * Ask the agent with full channel conversation history as context.
 * Automatically records the new message and the AI response to history.
 */
function askAgentWithHistory(channelId, channelName, newMsg, extraContext) {
  const history = loadHistory(channelId).slice(-CONTEXT_WINDOW);

  // Record incoming message to history before asking
  appendHistory(channelId, { role: 'user', user: newMsg.user, text: newMsg.text, ts: newMsg.ts });

  const historyBlock = formatHistory(history);
  const contextSection = extraContext ? `\n\nAdditional context:\n${extraContext}` : '';

  const prompt = [
    `You are an assistant helping respond to Slack messages in channel #${channelName} on behalf of the user.`,
    `You have access to the recent conversation history below. Use it to give a contextually appropriate reply.`,
    `Only output the reply text itself — no preamble like "Here is a reply:".`,
    '',
    historyBlock
      ? `--- Conversation history (oldest → newest) ---\n${historyBlock}\n--- End of history ---`
      : '--- No prior conversation history ---',
    contextSection,
    '',
    `New message from ${newMsg.user}: "${newMsg.text}"`,
    '',
    'Write a concise, natural Slack reply. Be brief unless the topic requires detail.',
  ].join('\n');

  const response = askAgent(prompt);

  // Record AI response to history
  appendHistory(channelId, { role: 'assistant', text: response, ts: String(Date.now() / 1000) });

  return response;
}

module.exports = { askAgent, askAgentWithHistory, appendHistory, loadHistory };
