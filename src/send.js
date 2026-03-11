'use strict';

const getClient = require('./client');

async function sendMessage(channel, text) {
  const result = await getClient().chat.postMessage({
    channel,
    text,
  });
  return result;
}

module.exports = { sendMessage };
