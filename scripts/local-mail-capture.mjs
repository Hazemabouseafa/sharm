import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const mailDir = path.join(rootDir, '.local-mailpit');
const storePath = path.join(mailDir, 'emails.json');

fs.mkdirSync(mailDir, { recursive: true });

function loadMessages() {
  try {
    if (!fs.existsSync(storePath)) return [];
    return JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch {
    return [];
  }
}

function saveMessages(messages) {
  fs.writeFileSync(storePath, JSON.stringify(messages, null, 2), 'utf8');
}

function parseRawEmail(raw, envelopeFrom, envelopeTo) {
  const splitIdx = raw.indexOf('\r\n\r\n');
  const headerPart = splitIdx !== -1 ? raw.slice(0, splitIdx) : raw;
  const bodyPart = splitIdx !== -1 ? raw.slice(splitIdx + 4) : '';
  const headers = {};
  const unfolded = headerPart.replace(/\r\n[ \t]+/g, ' ');
  for (const line of unfolded.split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon !== -1) {
      const k = line.slice(0, colon).trim().toLowerCase();
      const v = line.slice(colon + 1).trim();
      headers[k] = v;
    }
  }
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    from: headers['from'] || envelopeFrom,
    to: envelopeTo,
    subject: headers['subject'] || '(no subject)',
    headers,
    rawBody: bodyPart,
  };
}

const smtpPort = Number(process.env.SMTP_PORT || 1025);
const httpPort = Number(process.env.MAIL_HTTP_PORT || 8025);

const smtpServer = net.createServer((socket) => {
  socket.setEncoding('utf8');
  let buffer = '';
  let inData = false;
  let dataBuffer = '';
  let mailFrom = '';
  let rcptTo = [];

  socket.write('220 localhost ESMTP SharmPharaohLocalMailCapture\r\n');

  socket.on('data', (chunk) => {
    buffer += chunk;

    while (true) {
      if (!inData) {
        const lineEnd = buffer.indexOf('\r\n');
        if (lineEnd === -1) break;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        const upper = line.toUpperCase();

        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          socket.write('250-localhost\r\n250-8BITMIME\r\n250 SIZE 20971520\r\n');
        } else if (upper.startsWith('MAIL FROM:')) {
          mailFrom = line.slice(10).trim();
          rcptTo = [];
          socket.write('250 2.1.0 OK\r\n');
        } else if (upper.startsWith('RCPT TO:')) {
          rcptTo.push(line.slice(8).trim());
          socket.write('250 2.1.5 OK\r\n');
        } else if (upper === 'DATA') {
          inData = true;
          dataBuffer = '';
          socket.write('354 Start mail input; end with <CRLF>.<CRLF>\r\n');
        } else if (upper === 'RSET') {
          mailFrom = '';
          rcptTo = [];
          socket.write('250 2.0.0 OK\r\n');
        } else if (upper === 'NOOP') {
          socket.write('250 2.0.0 OK\r\n');
        } else if (upper === 'QUIT') {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
          return;
        } else {
          socket.write('250 OK\r\n');
        }
      } else {
        const endMarker = buffer.indexOf('\r\n.\r\n');
        if (endMarker === -1) break;
        dataBuffer += buffer.slice(0, endMarker);
        buffer = buffer.slice(endMarker + 5);
        inData = false;

        const msg = parseRawEmail(dataBuffer, mailFrom, rcptTo);
        const messages = loadMessages();
        messages.unshift(msg);
        saveMessages(messages.slice(0, 200));

        socket.write('250 2.0.0 OK: queued\r\n');
      }
    }
  });
});

const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET' && (req.url === '/api/v1/messages' || req.url === '/messages')) {
    const messages = loadMessages();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total: messages.length, messages }));
    return;
  }
  if (req.method === 'DELETE' && (req.url === '/api/v1/messages' || req.url === '/messages')) {
    saveMessages([]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cleared: true }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  const messages = loadMessages();
  res.end(`<!doctype html><html><head><title>Sharm Pharaoh Local Mail Capture</title></head><body><h1>Captured Emails (${messages.length})</h1><pre>${JSON.stringify(messages, null, 2).replace(/</g, '&lt;')}</pre></body></html>`);
});

smtpServer.listen(smtpPort, '127.0.0.1', () => {
  console.log(`Local SMTP capture listening on 127.0.0.1:${smtpPort}`);
});

httpServer.listen(httpPort, '127.0.0.1', () => {
  console.log(`Local Mail HTTP viewer listening on http://127.0.0.1:${httpPort}/api/v1/messages`);
});
