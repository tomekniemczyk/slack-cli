'use strict';

const getClient = require('./client');

async function readMessages(channel, limit = 10) {
  const result = await getClient().conversations.history({
    channel,
    limit,
  });

  return result.messages.map((msg) => ({
    user: msg.user || msg.bot_id || 'unknown',
    text: msg.text,
    ts: msg.ts,                                              // raw slack ts (for replies)
    displayTs: new Date(parseFloat(msg.ts) * 1000).toLocaleString(),
    replyCount: msg.reply_count || 0,
    threadTs: msg.thread_ts || null,
  }));
}

async function resolveChannelId(nameOrId) {
  // If it looks like a channel ID already (C... or G... or D...), use as-is
  if (/^[CGDW][A-Z0-9]+$/.test(nameOrId)) return nameOrId;

  const channelName = nameOrId.replace(/^#/, '');

  // Try conversations.list first; fall back to search on enterprise_is_restricted
  try {
    const result = await getClient().conversations.list({ limit: 200, types: 'public_channel,private_channel,im,mpim' });
    const channel = result.channels.find((c) => c.name === channelName);
    if (channel) return channel.id;
  } catch (err) {
    if (err.data?.error !== 'enterprise_is_restricted') throw err;
  }

  // Fallback: search for a message in that channel to get its ID
  const result = await getClient().search.messages({ query: `in:#${channelName}`, count: 1 });
  const match = result.messages?.matches?.[0];
  if (match?.channel?.id) return match.channel.id;

  throw new Error(`Channel "${nameOrId}" not found. Use 'channels' command to list available channels.`);
}

module.exports = { readMessages, resolveChannelId };
