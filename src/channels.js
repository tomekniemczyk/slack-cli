'use strict';

const getClient = require('./client');

async function listChannels() {
  const client = getClient();

  // Get sections and user's channel list in parallel
  const [sectionsRes, countsRes] = await Promise.all([
    client.apiCall('users.channelSections.list', {}),
    client.apiCall('client.counts', { include_message_counts: false }),
  ]);

  // Build unread/mention map from counts
  const countMap = new Map();
  for (const entry of [
    ...(countsRes.channels || []),
    ...(countsRes.ims || []),
    ...(countsRes.mpims || []),
  ]) {
    countMap.set(entry.id, { hasUnreads: entry.has_unreads, mentions: entry.mention_count || 0 });
  }

  // Collect all channel IDs we need to resolve (sections + user's channels)
  const allChannelIds = new Set([...countMap.keys()]);
  for (const section of (sectionsRes.channel_sections || [])) {
    for (const id of (section.channel_ids_page?.channel_ids || [])) {
      allChannelIds.add(id);
    }
  }

  // Fetch names in parallel batches of 20
  const idArray = [...allChannelIds];
  const infoMap = new Map();
  for (let i = 0; i < idArray.length; i += 20) {
    const batch = idArray.slice(i, i + 20);
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          const r = await client.conversations.info({ channel: id });
          const ch = r.channel;
          return {
            id: ch.id,
            name: ch.name || ch.user || id,
            type: ch.is_private ? 'private' : ch.is_im ? 'dm' : 'public',
          };
        } catch {
          return { id, name: id, type: 'unknown' };
        }
      })
    );
    for (const ch of results) infoMap.set(ch.id, ch);
  }

  // Build section → channels structure (only include channels user is member of)
  const assignedIds = new Set();
  const sections = [];

  for (const section of (sectionsRes.channel_sections || [])) {
    const sectionChannels = (section.channel_ids_page?.channel_ids || [])
      .filter((id) => countMap.has(id))
      .map((id) => ({
        ...(infoMap.get(id) || { id, name: id, type: 'unknown' }),
        ...(countMap.get(id) || {}),
      }));

    if (sectionChannels.length === 0) continue;

    sectionChannels.forEach((ch) => assignedIds.add(ch.id));
    sections.push({ name: section.name || section.type, channels: sectionChannels });
  }

  // Channels not assigned to any section → "Inne"
  const unassigned = [...countMap.keys()]
    .filter((id) => !assignedIds.has(id))
    .map((id) => ({
      ...(infoMap.get(id) || { id, name: id, type: 'unknown' }),
      ...(countMap.get(id) || {}),
    }));

  if (unassigned.length > 0) {
    sections.push({ name: 'Inne', channels: unassigned });
  }

  return sections;
}

module.exports = { listChannels };
