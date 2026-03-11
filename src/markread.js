'use strict';

const getClient = require('./client');

async function markAllRead() {
  const client = getClient();

  // Discover channels via search (enterprise may restrict conversations.list)
  let channels = [];
  try {
    const result = await client.users.conversations({
      types: 'public_channel,private_channel,im,mpim',
      exclude_archived: true,
      limit: 200,
    });
    channels = result.channels;
  } catch (err) {
    if (err.data?.error !== 'enterprise_is_restricted') throw err;
    // Fallback: discover via search
    const result = await client.search.messages({ query: '*', count: 200, sort: 'timestamp', sort_dir: 'desc' });
    const seen = new Map();
    for (const msg of (result.messages?.matches || [])) {
      if (msg.channel?.id && !seen.has(msg.channel.id)) {
        seen.set(msg.channel.id, { id: msg.channel.id, name: msg.channel.name });
      }
    }
    channels = Array.from(seen.values());
  }
  let marked = 0;
  const errors = [];

  await Promise.all(
    channels.map(async (ch) => {
      try {
        // Get latest message timestamp
        const history = await client.conversations.history({
          channel: ch.id,
          limit: 1,
        });

        if (!history.messages || history.messages.length === 0) return;

        const latestTs = history.messages[0].ts;
        await client.conversations.mark({ channel: ch.id, ts: latestTs });
        marked++;
      } catch (err) {
        errors.push({ channel: ch.name || ch.id, error: err.message });
      }
    })
  );

  return { marked, total: channels.length, errors };
}

module.exports = { markAllRead };
