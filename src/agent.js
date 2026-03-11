'use strict';

const { execSync } = require('child_process');

const NOISE_PATTERNS = [
  /^Total usage est:/,
  /^API time spent:/,
  /^Total session time:/,
  /^Total code changes:/,
  /^Breakdown by AI model:/,
  /^(claude|gpt)-/,
  /^\s*$/,
];

function cleanOutput(raw) {
  const lines = raw.split('\n');
  const result = [];
  let trailingBlank = 0;

  for (const line of lines) {
    if (NOISE_PATTERNS.some((p) => p.test(line))) continue;
    if (line.trim() === '') {
      trailingBlank++;
      if (trailingBlank <= 1) result.push(line);
    } else {
      trailingBlank = 0;
      result.push(line);
    }
  }

  return result.join('\n').trim();
}

function askAgent(prompt) {
  const output = execSync(`gh copilot -p ${JSON.stringify(prompt)}`, {
    encoding: 'utf8',
    timeout: 90000,
    env: { ...process.env },
  });
  return cleanOutput(output);
}

module.exports = { askAgent };
