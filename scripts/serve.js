import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)).replace(/[\\/]$/, '');
const port = Number(process.env.NANJA_PORT || 4187);
const host = process.env.NANJA_HOST || '127.0.0.1';
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg' };
const server = http.createServer(async (req, res) => {
  try {
    let url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    // Also expose a project subdirectory to verify GitHub Pages paths locally.
    if (url.startsWith('/rakugaki-nanja/')) url = url.slice('/rakugaki-nanja'.length);
    const file = path.resolve(root, '.' + (url.endsWith('/') ? url + 'index.html' : url));
    if (!file.startsWith(root + path.sep)) throw new Error('path');
    const data = await readFile(file); res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `ポート${port}は使用中です。NANJA_PORTに別の番号を指定して起動してください。`
    : error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => console.log(`ラクガキナンジャ！？: http://127.0.0.1:${port}/rakugaki-nanja/`));
