'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const dotenv = require('dotenv');

const CONFIG_DIR = process.env.SLACKCLI_CONFIG_DIR
  ? path.resolve(process.env.SLACKCLI_CONFIG_DIR)
  : path.join(os.homedir(), '.slack-cli');

const LEGACY_CONFIG_DIR = path.join(os.homedir(), '.slack');

function getEnvPath() {
  return path.join(CONFIG_DIR, '.env');
}

function getLegacyEnvPath() {
  return path.join(LEGACY_CONFIG_DIR, '.env');
}

function getRepoEnvPath() {
  return path.resolve(__dirname, '..', '.env');
}

function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

function envSearchPaths() {
  return [getEnvPath(), getLegacyEnvPath(), getRepoEnvPath()];
}

function loadSlackEnv() {
  const primary = getEnvPath();
  const fallbacks = [getLegacyEnvPath(), getRepoEnvPath()];
  const foundPath = envSearchPaths().find((p) => fs.existsSync(p));

  if (!fs.existsSync(primary)) {
    const fallback = fallbacks.find((p) => fs.existsSync(p));
    if (fallback) {
      ensureConfigDir();
      fs.copyFileSync(fallback, primary);
      fs.chmodSync(primary, 0o600);
    }
  }

  dotenv.config({
    path: fs.existsSync(primary) ? primary : foundPath || primary,
    quiet: true,
  });
  return fs.existsSync(primary) ? primary : foundPath || primary;
}

module.exports = {
  CONFIG_DIR,
  getEnvPath,
  ensureConfigDir,
  loadSlackEnv,
};
