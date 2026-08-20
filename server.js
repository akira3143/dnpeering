import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  handlePeeringSubmission,
  handleGetOccupiedPorts,
  handleGetSession,
  handleGetSessionsByAsn,
  handleDn42Lookup,
  handleDeleteSession,
  handleAuthChallenge,
  handleVerifySsh,
  handleAuthStatus,
  handleLoginPassword,
  handleSetPassword,
  handleRequestOtp,
  handleVerifyOtp,
  handleAuthMe,
  handlePeerStatus,
  handleLookingGlassQuery,
} from './server/apiHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = process.env.PORT || 3143;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  const parseBody = () => new Promise((resolve) => {
    let body = '';
    let size = 0;
    const MAX_BODY_SIZE = 64 * 1024; // 64KB limit
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        resolve({ _error: 'Body too large' });
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
  });

  const sendJson = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  // 1. API Route: POST /api/submit-peering
  if (url.pathname === '/api/submit-peering' && req.method === 'POST') {
    const parsed = await parseBody();
    const clientIp = (process.env.TRUST_PROXY === 'true' ? req.headers['x-forwarded-for'] : null) || req.socket.remoteAddress || '127.0.0.1';
    const authHeader = req.headers['authorization'];
    const result = await handlePeeringSubmission(parsed, Array.isArray(clientIp) ? clientIp[0] : clientIp, authHeader);
    return sendJson(result.status, result.data);
  }

  // 2. API Route: GET /api/node-ports
  if (url.pathname === '/api/node-ports' && req.method === 'GET') {
    const nodeId = url.searchParams.get('nodeId') || 'jp07';
    const result = handleGetOccupiedPorts(nodeId);
    return sendJson(result.status, result.data);
  }

  // 3. API Route: GET /api/session
  if (url.pathname === '/api/session' && req.method === 'GET') {
    const id = url.searchParams.get('id');
    const authHeader = req.headers['authorization'];
    const result = handleGetSession(id, authHeader);
    return sendJson(result.status, result.data);
  }

  // 4. API Route: GET /api/sessions-by-asn
  if (url.pathname === '/api/sessions-by-asn' && req.method === 'GET') {
    const asn = url.searchParams.get('asn');
    const authHeader = req.headers['authorization'];
    const result = handleGetSessionsByAsn(asn, authHeader);
    return sendJson(result.status, result.data);
  }

  // 5. API Route: GET /api/dn42-lookup
  if (url.pathname === '/api/dn42-lookup' && req.method === 'GET') {
    const asn = url.searchParams.get('asn');
    const result = await handleDn42Lookup(asn);
    return sendJson(result.status, result.data);
  }

  // 5. API Route: POST /api/delete-session
  if (url.pathname === '/api/delete-session' && req.method === 'POST') {
    const parsed = await parseBody();
    const authHeader = req.headers['authorization'];
    const result = await handleDeleteSession(parsed, authHeader);
    return sendJson(result.status, result.data);
  }

  // 6. API Route: POST /api/auth/challenge
  if (url.pathname === '/api/auth/challenge' && req.method === 'POST') {
    const parsed = await parseBody();
    const result = await handleAuthChallenge(parsed);
    return sendJson(result.status, result.data);
  }

  // 7. API Route: POST /api/auth/verify-ssh
  if (url.pathname === '/api/auth/verify-ssh' && req.method === 'POST') {
    const parsed = await parseBody();
    const result = await handleVerifySsh(parsed);
    return sendJson(result.status, result.data);
  }

  // 8. API Route: POST /api/auth/status
  if (url.pathname === '/api/auth/status' && req.method === 'POST') {
    const parsed = await parseBody();
    const result = await handleAuthStatus(parsed);
    return sendJson(result.status, result.data);
  }

  // 9. API Route: POST /api/auth/login-password
  if (url.pathname === '/api/auth/login-password' && req.method === 'POST') {
    const parsed = await parseBody();
    const result = await handleLoginPassword(parsed);
    return sendJson(result.status, result.data);
  }

  // 10. API Route: POST /api/auth/set-password
  if (url.pathname === '/api/auth/set-password' && req.method === 'POST') {
    const parsed = await parseBody();
    const authHeader = req.headers['authorization'];
    const result = await handleSetPassword(parsed, authHeader);
    return sendJson(result.status, result.data);
  }

  // 11. API Route: POST /api/auth/request-otp
  if (url.pathname === '/api/auth/request-otp' && req.method === 'POST') {
    const parsed = await parseBody();
    const result = await handleRequestOtp(parsed);
    return sendJson(result.status, result.data);
  }

  // 12. API Route: POST /api/auth/verify-otp
  if (url.pathname === '/api/auth/verify-otp' && req.method === 'POST') {
    const parsed = await parseBody();
    const result = await handleVerifyOtp(parsed);
    return sendJson(result.status, result.data);
  }

  // 13. API Route: GET /api/auth/me
  if (url.pathname === '/api/auth/me' && req.method === 'GET') {
    const authHeader = req.headers['authorization'];
    const result = handleAuthMe(authHeader);
    return sendJson(result.status, result.data);
  }

  // 14. API Route: GET /api/peer-status
  if (url.pathname === '/api/peer-status' && req.method === 'GET') {
    const asn = url.searchParams.get('asn');
    const node = url.searchParams.get('node');
    const name = url.searchParams.get('name');
    const result = await handlePeerStatus(asn, node, name);
    return sendJson(result.status, result.data);
  }

  // 15. API Route: POST /api/looking-glass/query
  if (url.pathname === '/api/looking-glass/query' && req.method === 'POST') {
    const parsed = await parseBody();
    const result = await handleLookingGlassQuery(parsed);
    return sendJson(result.status, result.data);
  }

  // 16. Health check route
  if (url.pathname === '/health' || url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', time: new Date().toISOString() }));
    return;
  }

  // 13. Static Files from dist (with path traversal protection)
  const requestedPath = path.normalize(url.pathname).replace(/^(\.\.([\\/]|$))+/g, '');
  let filePath = path.join(DIST_DIR, requestedPath === '/' || requestedPath === '' ? 'index.html' : requestedPath);

  // Security: Ensure resolved path is within DIST_DIR
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
      });
      res.end(content);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AkiLab DN42 Portal Server running on http://0.0.0.0:${PORT}`);
});
