'use strict';

const getClient = require('./client');

async function getMentions(limit = 20) {
  const client = getClient();

  // Get current user's ID
  const auth = await client.auth.test();
  const userId = auth.user_id;

  const result = await client.search.messages({
    query: `<@${userId}>`,
    count: limit,
    sort: 'timestamp',
    sort_dir: 'desc',
  });

  return result.messages.matches.map((msg) => ({
    channel: msg.channel.name,
    channelId: msg.channel.id,
    user: msg.username || msg.user || 'unknown',
    text: msg.text,
    ts: new Date(parseFloat(msg.ts) * 1000).toLocaleString(),
    permalink: msg.permalink,
  }));
}

module.exports = { getMentions };
