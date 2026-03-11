'use strict';

const getClient = require('./client');

async function replyToMessage(channel, threadTs, text) {
  const result = await getClient().chat.postMessage({
    channel,
    text,
    thread_ts: threadTs,
  });
  return result;
}

async function readThread(channel, threadTs, limit = 50) {
  const result = await getClient().conversations.replies({
    channel,
    ts: threadTs,
    limit,
  });

  return result.messages.map((msg) => ({
    user: msg.user || msg.bot_id || 'unknown',
    text: msg.text,
    ts: msg.ts,
    displayTs: new Date(parseFloat(msg.ts) * 1000).toLocaleString(),
    isParent: msg.ts === threadTs,
  }));
}

module.exports = { replyToMessage, readThread };
