'use strict';

const { WebClient } = require('@slack/web-api');
const { loadSlackEnv, getEnvPath } = require('./config');

const loadedEnvPath = loadSlackEnv();

let _client;

function getClient() {
  if (!_client) {
    if (!process.env.SLACK_TOKEN) {
      console.error(`Error: SLACK_TOKEN not set. Expected in: ${loadedEnvPath || getEnvPath()}`);
      console.error('Run: slackcli import-desktop-token');
      process.exit(1);
    }
    const options = {};
    if (process.env.SLACK_COOKIE_D) {
      options.headers = { Cookie: `d=${process.env.SLACK_COOKIE_D}` };
    }
    _client = new WebClient(process.env.SLACK_TOKEN, options);
  }
  return _client;
}

module.exports = getClient;
module.exports.getClient = getClient;
