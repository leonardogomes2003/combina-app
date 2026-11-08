// Servidor local para testar sem o Vercel: API_FOOTBALL_KEY=... npm run dev
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.js': 'text/javascript' };

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const api = pathname.match(/^\/api\/([a-z]+)$/);
  if (api) {
    try {
      const mod = await import(`./api/${api[1]}.js`);
      return mod.default(req, res);
    } catch {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Rota desconhecida.' }));
    }
  }
  const file = normalize(join('public', pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith('public')) { res.statusCode = 403; return res.end(); }
  try {
    const body = await readFile(file);
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('Não encontrado');
  }
}).listen(PORT, () => console.log(`Combina em http://localhost:${PORT}`));
