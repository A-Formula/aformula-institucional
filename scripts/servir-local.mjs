// Servidor estático só pra conferência local. Imita o cleanUrls da Vercel:
// /x → x/index.html ou x.html. NÃO imita redirects (isso só o deploy prova).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2];
const PORT = Number(process.argv[3] || 8788);
const TIPO = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.xml': 'application/xml', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.geojson': 'application/json' };

http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const base = path.join(ROOT, p);
  for (const c of [base, base + '.html', path.join(base, 'index.html')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      res.writeHead(200, { 'content-type': TIPO[path.extname(c).toLowerCase()] || 'application/octet-stream' });
      return res.end(fs.readFileSync(c));
    }
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('404');
}).listen(PORT, () => console.log('local em http://127.0.0.1:' + PORT));
