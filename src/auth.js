'use strict';

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URLSearchParams } = require('url');

const PORT = 3000;
const REDIRECT_URI = `https://localhost:${PORT}/callback`;

const SCOPES = [
  'channels:history',
  'channels:read',
  'channels:write',
  'chat:write',
  'groups:history',
  'groups:read',
  'groups:write',
  'im:history',
  'im:read',
  'im:write',
  'mpim:history',
  'mpim:read',
  'mpim:write',
  'search:read',
  'users:read',
].join(',');

function generateCert() {
  const selfsigned = require('selfsigned');
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = selfsigned.generate(attrs, { days: 1, keySize: 2048 });
  return { key: pems.private, cert: pems.cert };
}

function writeTokenToEnv(token) {
  const envPath = path.resolve(process.cwd(), '.env');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
  }

  if (content.includes('SLACK_TOKEN=')) {
    content = content.replace(/^SLACK_TOKEN=.*/m, `SLACK_TOKEN=${token}`);
  } else {
    content = content.trimEnd() + (content ? '\n' : '') + `SLACK_TOKEN=${token}\n`;
  }

  fs.writeFileSync(envPath, content);
}

async function exchangeCodeForToken(code, clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
    }).toString();

    const options = {
      hostname: 'slack.com',
      path: '/api/oauth.v2.access',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.ok) return reject(new Error(`Slack error: ${json.error}`));
          // Prefer user authed_user token if present, otherwise use access_token
          const token = (json.authed_user && json.authed_user.access_token) || json.access_token;
          if (!token) return reject(new Error('No token in Slack response'));
          resolve(token);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function login() {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('❌ Brak SLACK_CLIENT_ID lub SLACK_CLIENT_SECRET w .env');
    console.error('   Skopiuj te wartości z https://api.slack.com/apps → Basic Information');
    process.exit(1);
  }

  const { key, cert } = generateCert();

  const authUrl =
    `https://slack.com/oauth/v2/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&scope=` + // bot scopes (empty for user-only)
    `&user_scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

  return new Promise((resolve, reject) => {
    const server = https.createServer({ key, cert }, async (req, res) => {
      const reqUrl = new URL(req.url, `https://localhost:${PORT}`);

      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>❌ Błąd autoryzacji: ${error}</h2><p>Zamknij to okno.</p>`);
        server.close();
        return reject(new Error(`OAuth error: ${error}`));
      }

      if (!code) {
        res.writeHead(400);
        res.end('Missing code');
        return;
      }

      try {
        const token = await exchangeCodeForToken(code, clientId, clientSecret);
        writeTokenToEnv(token);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html><body style="font-family:sans-serif;padding:2em;text-align:center">
            <h2>✅ Zalogowano pomyślnie!</h2>
            <p>Token zapisany do <code>.env</code>.</p>
            <p>Możesz zamknąć to okno i wrócić do terminala.</p>
          </body></html>
        `);

        server.close();
        resolve(token);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h2>❌ Błąd: ${err.message}</h2>`);
        server.close();
        reject(err);
      }
    });

    server.listen(PORT, async () => {
      console.log(`\n🔐 Otwieram przeglądarkę w celu autoryzacji Slack...`);
      console.log(`   Jeśli przeglądarka się nie otworzyła, wejdź ręcznie na:`);
      console.log(`   ${authUrl}\n`);
      console.log(`⚠️  Przeglądarka pokaże ostrzeżenie o certyfikacie — kliknij`);
      console.log(`   "Zaawansowane" → "Przejdź dalej do localhost" (to bezpieczne)\n`);

      try {
        const open = await import('open');
        await open.default(authUrl);
      } catch {
        // open failed silently — URL already printed above
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} jest zajęty. Zamknij inne procesy i spróbuj ponownie.`);
      }
      reject(err);
    });
  });
}

module.exports = { login };
