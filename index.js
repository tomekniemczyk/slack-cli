#!/usr/bin/env node
'use strict';

const { Command } = require('commander');
const { sendMessage } = require('./src/send');
const { readMessages, resolveChannelId } = require('./src/read');
const { listChannels } = require('./src/channels');
const { login } = require('./src/auth');
const { getMentions } = require('./src/mentions');
const { markAllRead } = require('./src/markread');
const { replyToMessage, readThread } = require('./src/reply');
const { startDaemon } = require('./src/daemon');

const { execFileSync } = require('child_process');
const path = require('path');

const program = new Command();

program
  .name('slack-cli')
  .version('1.0.0')
  .description('CLI tool to send and read Slack messages');

program
  .command('import-desktop-token')
  .description('Extract token from Slack desktop app and save to .env (no admin approval needed)')
  .action(() => {
    try {
      const script = path.join(__dirname, 'src', 'extract_desktop_token.py');
      execFileSync('python3', [script], { stdio: 'inherit' });
    } catch (err) {
      console.error(`❌ Failed: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('login')
  .description('Authenticate with Slack via browser (OAuth 2.0) and save token to .env')
  .action(async () => {
    try {
      await login();
      console.log('✅ Token zapisany do .env — możesz teraz używać send/read/channels');
    } catch (err) {
      console.error(`❌ Logowanie nieudane: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('send <channel> <message>')
  .description('Send a message to a Slack channel (use channel name or ID)')
  .action(async (channel, message) => {
    try {
      const channelId = await resolveChannelId(channel);
      await sendMessage(channelId, message);
      console.log(`✅ Message sent to #${channel}`);
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('read <channel>')
  .description('Read recent messages from a Slack channel')
  .option('-l, --limit <number>', 'Number of messages to fetch', '10')
  .action(async (channel, options) => {
    try {
      const channelId = await resolveChannelId(channel);
      const messages = await readMessages(channelId, parseInt(options.limit, 10));
      if (messages.length === 0) {
        console.log('No messages found.');
        return;
      }
      console.log(`\n📨 Last ${messages.length} messages from #${channel}:\n`);
      messages.reverse().forEach((msg) => {
        const thread = msg.replyCount > 0 ? ` \x1b[33m[🧵 ${msg.replyCount} replies]\x1b[0m` : '';
        console.log(`\x1b[2m[${msg.displayTs}]\x1b[0m \x1b[1m${msg.user}\x1b[0m  \x1b[2mts:${msg.ts}\x1b[0m${thread}`);
        console.log(`  ${msg.text}\n`);
      });
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('reply <channel> <ts> <message>')
  .description('Reply to a message in a thread (use ts shown in read output)')
  .action(async (channel, ts, message) => {
    try {
      const channelId = await resolveChannelId(channel);
      await replyToMessage(channelId, ts, message);
      console.log(`✅ Reply sent to thread ${ts}`);
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('thread <channel> <ts>')
  .description('Read a full thread by message ts')
  .option('-l, --limit <number>', 'Number of replies to fetch', '50')
  .action(async (channel, ts, options) => {
    try {
      const channelId = await resolveChannelId(channel);
      const messages = await readThread(channelId, ts, parseInt(options.limit, 10));
      if (messages.length === 0) {
        console.log('No messages in thread.');
        return;
      }
      console.log(`\n🧵 Thread (${messages.length} messages):\n`);
      messages.forEach((msg) => {
        const label = msg.isParent ? '\x1b[1m[parent]\x1b[0m' : '  └─';
        console.log(`${label} \x1b[2m[${msg.displayTs}]\x1b[0m \x1b[1m${msg.user}\x1b[0m  \x1b[2mts:${msg.ts}\x1b[0m`);
        console.log(`${msg.isParent ? '' : '     '}${msg.text}\n`);
      });
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('channels')
  .description('List all accessible Slack channels grouped by section')
  .action(async () => {
    try {
      const sections = await listChannels();
      if (sections.length === 0) {
        console.log('No channels found.');
        return;
      }
      console.log();
      for (const section of sections) {
        console.log(`\x1b[1m▸ ${section.name}\x1b[0m`);
        for (const c of section.channels) {
          const icon = c.type === 'private' ? '🔒' : c.type === 'dm' ? '💬' : '#';
          const unread = c.hasUnreads ? ' \x1b[34m●\x1b[0m' : '';
          const mention = c.mentions > 0 ? ` \x1b[31m🔔${c.mentions}\x1b[0m` : '';
          console.log(`  ${icon} ${c.name.padEnd(40)} ${c.id}${unread}${mention}`);
        }
      }
      console.log();
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('mentions')
  .description('Show messages where you are mentioned (@you)')
  .option('-l, --limit <number>', 'Number of mentions to fetch', '20')
  .action(async (options) => {
    try {
      const mentions = await getMentions(parseInt(options.limit, 10));
      if (mentions.length === 0) {
        console.log('Brak wzmianek.');
        return;
      }
      console.log(`\n🔔 Twoje wzmianki (${mentions.length}):\n`);
      mentions.forEach((m) => {
        console.log(`[${m.ts}] #${m.channel} — ${m.user}`);
        console.log(`  ${m.text}`);
        console.log(`  🔗 ${m.permalink}\n`);
      });
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('mark-read')
  .description('Mark all channels and DMs as read')
  .action(async () => {
    try {
      console.log('⏳ Oznaczam wszystko jako przeczytane...');
      const { marked, total, errors } = await markAllRead();
      console.log(`✅ Oznaczono ${marked}/${total} kanałów jako przeczytane.`);
      if (errors.length > 0) {
        console.log(`⚠️  Błędy (${errors.length}):`);
        errors.forEach((e) => console.log(`   #${e.channel}: ${e.error}`));
      }
    } catch (err) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('agent-start <channels...>')
  .description('Start AI daemon: monitors channels, proposes AI replies, waits for your approval')
  .option('-i, --interval <seconds>', 'Polling interval in seconds', '10')
  .addHelpText(
    'after',
    `
Examples:
  slackcli agent-start general review
  slackcli agent-start review --interval 30

The daemon will:
  1. Poll specified channels every N seconds
  2. For each new message, generate an AI response using gh copilot
  3. If a GitHub PR link is detected, generate a full code review
  4. Show the proposal and ask: [y] Send  [n] Skip  [e] Edit  [s] Stop
  5. Only send if you approve

State is saved to ~/.slack-agent-state.json
`
  )
  .action(async (channels, options) => {
    try {
      await startDaemon(channels, { interval: parseInt(options.interval, 10) });
    } catch (err) {
      console.error(`❌ Agent error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
