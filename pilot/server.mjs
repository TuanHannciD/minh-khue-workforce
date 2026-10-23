import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);
const headers = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
};
function json(res, status, data) {
  res.writeHead(status, { ...headers, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
function fail(res, status, code, message) { json(res, status, { error: { code, message } }); }

export async function startPilot({ dbPath }) {
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, text TEXT NOT NULL, operation_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)');
  const list = db.prepare('SELECT id, text, created_at AS createdAt FROM notes ORDER BY rowid DESC');
  const lookup = db.prepare('SELECT id, text, created_at AS createdAt FROM notes WHERE operation_key = ?');
  const insert = db.prepare('INSERT INTO notes(id, text, operation_key, created_at) VALUES (?, ?, ?, ?)');
  let url;
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.host !== new URL(url).host) return fail(res, 403, 'HOST', 'Target không hợp lệ.');
      const pathname = new URL(req.url, url).pathname;
      if (req.method === 'GET' && assets.has(pathname)) {
        const [file, type] = assets.get(pathname);
        const body = await readFile(new URL(`./public/${file}`, import.meta.url));
        res.writeHead(200, { ...headers, 'content-type': type }); res.end(body); return;
      }
      if (pathname !== '/api/notes') return fail(res, 404, 'NOT_FOUND', 'Không tìm thấy.');
      if (req.method === 'GET') return json(res, 200, { notes: list.all() });
      if (req.method !== 'POST') return fail(res, 405, 'METHOD', 'Phương thức không hỗ trợ.');
      if (req.headers.origin && req.headers.origin !== url) return fail(res, 403, 'ORIGIN', 'Origin không được phép.');
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return fail(res, 415, 'CONTENT_TYPE', 'Cần dữ liệu JSON.');
      const key = req.headers['idempotency-key'];
      if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(key)) return fail(res, 400, 'KEY', 'Thiếu mã thao tác hợp lệ.');
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024) { fail(res, 413, 'SIZE', 'Dữ liệu quá lớn.'); return; }
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return fail(res, 400, 'JSON', 'JSON không hợp lệ.'); }
      const text = typeof input?.text === 'string' ? input.text.trim() : '';
      if (!text || text.length > 200) return fail(res, 400, 'TEXT', 'Nhập ghi chú từ 1 đến 200 ký tự.');
      const existing = lookup.get(key);
      if (existing) {
        if (existing.text !== text) return fail(res, 409, 'CONFLICT', 'Mã thao tác đã dùng với nội dung khác.');
        return json(res, 200, { note: existing, replayed: true });
      }
      // Explicit pilot-only failure: actual HTTP 503, no mock/interception and no DB write.
      if (req.headers['x-pilot-simulate-failure'] === '1') return fail(res, 503, 'SIMULATED', 'Lỗi thử nghiệm. Hãy bấm Lưu ghi chú để thử lại.');
      const note = { id: randomUUID(), text, createdAt: new Date().toISOString() };
      insert.run(note.id, note.text, key, note.createdAt);
      return json(res, 201, { note, replayed: false });
    } catch {
      if (!res.headersSent) fail(res, 500, 'INTERNAL', 'Không thể xử lý. Hãy thử lại.');
      else res.end();
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  } catch (error) { db.close(); throw error; }
  url = `http://127.0.0.1:${server.address().port}`;
  let closing;
  return {
    url, dbPath,
    close() {
      if (!closing) closing = new Promise((resolve, reject) => {
        server.close(error => { try { db.close(); } catch (dbError) { reject(dbError); return; } error ? reject(error) : resolve(); });
        server.closeIdleConnections();
      });
      return closing;
    },
  };
}
