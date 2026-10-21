/**
 * Serveur SMTP de CAPTURE local — tests d'e-mail SANS ENVOI RÉEL.
 *
 * Aucune dépendance (uniquement les modules Node `net` / `http` / `fs`),
 * aucun compte, aucun réseau externe : Docker n'est pas requis.
 *
 *   SMTP     : port 1025  (SMTP_HOST=127.0.0.1 SMTP_PORT=1025 SMTP_NO_AUTH=true)
 *   HTTP     : port 8025  (lecture des messages capturés)
 *   Fichiers : .tmp/capture-mail/<n>.json / <n>.html / <n>.txt (durable)
 *
 * API HTTP :
 *   GET    /health             → { ok, count, paused }
 *   GET    /messages           → [{ id, date, from, to, subject, hasHtml, hasText }]
 *   GET    /messages/:id       → en-têtes + html + texte
 *   GET    /messages/:id.html  → corps HTML brut
 *   GET    /messages/:id.txt   → corps texte brut
 *   DELETE /messages           → remise à zéro (mémoire + fichiers)
 *   POST   /control/pause      → ferme le port SMTP (simule une panne)
 *   POST   /control/resume     → rouvre le port SMTP
 *
 * Compilation / exécution (depuis strapi-backend/) :
 *   npx tsc scripts/smtp-capture.ts --outDir .tmp-scripts --module CommonJS \
 *     --moduleResolution Node --esModuleInterop --skipLibCheck --target ES2020
 *   node .tmp-scripts/smtp-capture.js
 *   node .tmp-scripts/scripts/smtp-capture.js
 */
import net from 'net';
import http from 'http';
import fs from 'fs';
import path from 'path';

const SMTP_PORT = parseInt(process.env.SMTP_CAPTURE_PORT || '1025', 10);
const HTTP_PORT = parseInt(process.env.SMTP_CAPTURE_HTTP_PORT || '8025', 10);
const OUT_DIR = path.resolve(process.cwd(), '.tmp', 'capture-mail');

// ─── Décodage MIME minimal ──────────────────────────────────────────────────

const decodeQuotedPrintable = (input: string): string => {
  // Les octets décodés sont du UTF-8 : on passe par un binaire latin1 puis
  // on re-décode en UTF-8 (sinon « é » → « Ã© »).
  const binary = input
    .replace(/=\r?\n/g, '') // soft line break
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    );
  return Buffer.from(binary, 'latin1').toString('utf8');
};

const decodeBase64 = (input: string): string =>
  Buffer.from(input.replace(/\s+/g, ''), 'base64').toString('utf8');

const decodeBody = (body: string, encoding?: string): string => {
  const enc = String(encoding || '').toLowerCase().trim();
  if (enc === 'quoted-printable') return decodeQuotedPrintable(body);
  if (enc === 'base64') return decodeBase64(body);
  return body;
};

/** Décodage RFC 2047 des en-têtes (=?UTF-8?B?…?= / =?UTF-8?Q?…?=). */
const decodeMimeHeader = (value: string): string =>
  value
    // Deux mots encodés adjacents sont CONCATÉNÉS (RFC 2047) : l'espace
    // issu du pliage du contenu de l'en-tête doit disparaître, sinon
    // « publié(e) » devient « publi é(e) ».
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (match, charset: string, kind: string, payload: string) => {
      try {
        const text = String(kind).toUpperCase() === 'B' ? decodeBase64(payload) : decodeQuotedPrintable(payload.replace(/_/g, ' '));
        return text;
      } catch {
        return match;
      }
    });

interface ParsedMessage {
  id: number;
  date: string;
  envelopeFrom: string;
  envelopeTo: string[];
  headers: Record<string, string>;
  subject: string;
  html: string | null;
  text: string | null;
}

const parseHeaders = (block: string): Record<string, string> => {
  const headers: Record<string, string> = {};
  const unfolded = block.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return headers;
};

/** Extrait une partie (text/plain ou text/html) d'un part MIME. */
const parsePart = (part: string): { headers: Record<string, string>; body: string } => {
  const sep = part.indexOf('\r\n\r\n') >= 0 ? '\r\n\r\n' : '\n\n';
  const idx = part.indexOf(sep);
  const head = idx >= 0 ? part.slice(0, idx) : '';
  const body = idx >= 0 ? part.slice(idx + sep.length) : part;
  const headers = parseHeaders(head);
  return { headers, body: decodeBody(body, headers['content-transfer-encoding']) };
};

const extractBody = (
  headers: Record<string, string>,
  rawBody: string
): { html: string | null; text: string | null } => {
  const contentType = headers['content-type'] || 'text/plain';
  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);

  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = rawBody
      .split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?`, 'g'))
      .filter((p) => typeof p === 'string' && p.trim() !== '--' && p.trim() !== '');
    let html: string | null = null;
    let text: string | null = null;
    for (const part of parts) {
      const parsed = parsePart(part.replace(/^\r?\n/, ''));
      const ct = (parsed.headers['content-type'] || '').toLowerCase();
      if (ct.includes('text/html')) html = parsed.body;
      else if (ct.includes('text/plain')) text = parsed.body;
    }
    return { html, text };
  }

  const parsed = parsePart(`${headers['content-type'] ? `Content-Type: ${headers['content-type']}\r\n` : ''}${headers['content-transfer-encoding'] ? `Content-Transfer-Encoding: ${headers['content-transfer-encoding']}\r\n` : ''}\r\n${rawBody}`);
  if (contentType.toLowerCase().includes('text/html')) return { html: parsed.body, text: null };
  return { html: null, text: parsed.body };
};

// ─── État ───────────────────────────────────────────────────────────────────

let messages: ParsedMessage[] = [];
let seq = 0;

const storeMessage = (msg: ParsedMessage): void => {
  try {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `${msg.id}.json`), JSON.stringify(msg, null, 2), 'utf8');
    if (msg.html) fs.writeFileSync(path.join(OUT_DIR, `${msg.id}.html`), msg.html, 'utf8');
    if (msg.text) fs.writeFileSync(path.join(OUT_DIR, `${msg.id}.txt`), msg.text, 'utf8');
  } catch (err) {
    console.error('[capture] écriture fichier impossible :', (err as Error).message);
  }
};

const clearMessages = (): void => {
  messages = [];
  try {
    if (fs.existsSync(OUT_DIR)) {
      for (const f of fs.readdirSync(OUT_DIR)) fs.unlinkSync(path.join(OUT_DIR, f));
    }
  } catch (err) {
    console.error('[capture] nettoyage impossible :', (err as Error).message);
  }
};

// ─── Serveur SMTP (sous-ensemble suffisant à nodemailer) ────────────────────

const openSockets = new Set<net.Socket>();
let smtpServer: net.Server | null = null;
let paused = false;

const startSmtp = (): void => {
  smtpServer = net.createServer((socket) => {
    openSockets.add(socket);
    socket.on('close', () => openSockets.delete(socket));
    socket.on('error', () => openSockets.delete(socket));

    let buffer = '';
    let mode: 'command' | 'data' = 'command';
    let dataBuffer = '';
    let envelopeFrom = '';
    const envelopeTo: string[] = [];

    socket.write('220 capture.local ESMTP prêt\r\n');

    const respond = (line: string) => socket.write(`${line}\r\n`);

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      // Boucle unique : le point final (`CRLF.CRLF`) peut être scindé entre
      // deux paquets TCP — on accumulate dans dataBuffer tant qu'il n'apparaît
      // pas COMBINÉ (la recherche porte sur dataBuffer + buffer).
      for (;;) {
        if (mode === 'data') {
          const combined = dataBuffer + buffer;
          buffer = '';
          const endIdx = combined.search(/\r\n\.\r\n|\n\.\n/);
          if (endIdx === -1) {
            dataBuffer = combined;
            return; // en attente du reste du corps
          }
          const match = combined.slice(endIdx).match(/^\r\n\.\r\n|^\n\.\n/);
          const eaten = match ? match[0].length : 5;
          const raw = combined.slice(0, endIdx);
          buffer = combined.slice(endIdx + eaten); // éventuel pipeline (QUIT…)
          dataBuffer = '';
          mode = 'command';

          try {
            // Dés-stuffing des points en tête de ligne
            const unStuffed = raw.replace(/(^|\r\n)\.\./g, '$1.');

          seq += 1;
          const sepIdx =
            unStuffed.indexOf('\r\n\r\n') >= 0
              ? unStuffed.indexOf('\r\n\r\n')
              : unStuffed.indexOf('\n\n');
          const sepLen = sepIdx >= 0 && unStuffed.startsWith('\r\n\r\n', sepIdx) ? 4 : 2;
          const headers = parseHeaders(sepIdx >= 0 ? unStuffed.slice(0, sepIdx) : unStuffed);
          const bodyRaw = sepIdx >= 0 ? unStuffed.slice(sepIdx + sepLen) : '';
          const { html, text } = extractBody(headers, bodyRaw);
          const msg: ParsedMessage = {
            id: seq,
            date: new Date().toISOString(),
            envelopeFrom,
            envelopeTo: [...envelopeTo],
            headers,
            subject: decodeMimeHeader(headers['subject'] || ''),
            html,
            text,
          };
          messages.push(msg);
          storeMessage(msg);
          console.log(
            `📬 [capture #${msg.id}] → ${msg.envelopeTo.join(', ')} | ${msg.subject.slice(0, 90)}`
          );
          respond(`250 2.0.0 Ok: capturé comme #${msg.id}`);
          } catch (err) {
            // Le serveur de capture ne doit JAMAIS tomber sur un message bizarre.
            console.error('[capture] traitement impossible :', (err as Error).message);
            respond('451 4.3.0 Erreur de traitement interne (voir log capture)');
          }
          continue; // traite d'éventuelles commandes suivantes du même flux
        }

        // mode commande
        const nl = buffer.search(/\r?\n/);
        if (nl === -1) return;
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + (buffer[nl] === '\r' ? 2 : 1));
        handleCommand(line);
      }
    });

    const handleCommand = (line: string) => {
      const [rawCmd, ...rest] = line.split(' ');
      const cmd = (rawCmd || '').toUpperCase();
      const args = rest.join(' ');

      switch (cmd) {
        case 'EHLO':
          respond('250-capture.local');
          respond('250-8BITMIME');
          respond('250-SIZE 35882577');
          respond('250 HELP');
          break;
        case 'HELO':
          respond('250 capture.local');
          break;
        case 'MAIL': {
          const m = args.match(/FROM:\s*<?([^>]*)>?/i);
          envelopeFrom = m ? m[1].trim() : '';
          respond('250 2.1.0 Ok');
          break;
        }
        case 'RCPT': {
          const m = args.match(/TO:\s*<?([^>]*)>?/i);
          if (m) envelopeTo.push(m[1].trim());
          respond('250 2.1.5 Ok');
          break;
        }
        case 'DATA':
          mode = 'data';
          dataBuffer = '';
          respond('354 Finissez avec <CRLF>.<CRLF>');
          break;
        case 'RSET':
          envelopeFrom = '';
          envelopeTo.length = 0;
          respond('250 2.0.0 Ok');
          break;
        case 'NOOP':
          respond('250 2.0.0 Ok');
          break;
        case 'VRFY':
          respond('252 2.5.2 Vérification impossible');
          break;
        case 'STARTTLS':
          respond('454 4.7.0 TLS non disponible (capture locale)');
          break;
        case 'AUTH':
          respond('502 5.5.1 Auth non supporté (mode capture, SMTP_NO_AUTH=true)');
          break;
        case 'QUIT':
          respond('221 2.0.0 Au revoir');
          socket.end();
          break;
        default:
          respond(`500 5.5.2 Commande non reconnue : ${rawCmd}`);
      }
    };

    socket.on('end', () => openSockets.delete(socket));
  });

  smtpServer.listen(SMTP_PORT, '127.0.0.1', () => {
    console.log(`✅ [capture] SMTP d'écoute sur 127.0.0.1:${SMTP_PORT}`);
  });
  smtpServer.on('error', (err) => {
    console.error(`❌ [capture] erreur SMTP (${SMTP_PORT}) :`, err.message);
  });
};

const pauseSmtp = (): void => {
  if (paused || !smtpServer) return;
  paused = true;
  smtpServer.close();
  for (const s of openSockets) s.destroy();
  openSockets.clear();
  console.log('🛑 [capture] port SMTP fermé (panne simulée).');
};

const resumeSmtp = (): void => {
  if (!paused) return;
  paused = false;
  startSmtp();
  console.log('▶️  [capture] port SMTP réouvert.');
};

// ─── Serveur HTTP (lecture des captures) ────────────────────────────────────

const json = (res: http.ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
};

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${HTTP_PORT}`);
  const segs = url.pathname.split('/').filter(Boolean);

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, count: messages.length, paused, outDir: OUT_DIR });
  }
  if (req.method === 'GET' && url.pathname === '/messages') {
    return json(
      res,
      200,
      messages.map((m) => ({
        id: m.id,
        date: m.date,
        from: m.envelopeFrom,
        to: m.envelopeTo,
        subject: m.subject,
        listUnsubscribe: m.headers['list-unsubscribe'] || null,
        hasHtml: Boolean(m.html),
        hasText: Boolean(m.text),
      }))
    );
  }
  if (req.method === 'DELETE' && url.pathname === '/messages') {
    clearMessages();
    return json(res, 200, { ok: true, count: 0 });
  }
  if (req.method === 'POST' && url.pathname === '/control/pause') {
    pauseSmtp();
    return json(res, 200, { ok: true, paused });
  }
  if (req.method === 'POST' && url.pathname === '/control/resume') {
    resumeSmtp();
    return json(res, 200, { ok: true, paused });
  }

  const mMatch = url.pathname.match(/^\/messages\/(\d+)(\.(html|txt))?$/);
  if (req.method === 'GET' && mMatch) {
    const id = parseInt(mMatch[1], 10);
    const msg = messages.find((x) => x.id === id);
    if (!msg) return json(res, 404, { detail: `message ${id} introuvable` });
    if (mMatch[2] === '.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(msg.html || '');
    }
    if (mMatch[2] === '.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(msg.text || '');
    }
    return json(res, 200, msg);
  }

  return json(res, 404, { detail: 'route inconnue', routes: ['/health', '/messages', '/messages/:id[.html|.txt]', 'DELETE /messages', 'POST /control/pause|resume'] });
});

// ─── Démarrage ──────────────────────────────────────────────────────────────

startSmtp();
httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`✅ [capture] API HTTP sur http://127.0.0.1:${HTTP_PORT} (fichiers : ${OUT_DIR})`);
});
httpServer.on('error', (err) => {
  console.error(`❌ [capture] erreur HTTP (${HTTP_PORT}) :`, err.message);
});

const shutdown = () => {
  console.log('\n[capture] arrêt.');
  for (const s of openSockets) s.destroy();
  smtpServer?.close();
  httpServer.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
