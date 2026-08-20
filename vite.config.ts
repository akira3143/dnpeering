import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// @ts-ignore
import { handlePeeringSubmission, handleGetOccupiedPorts, handleGetSession, handleGetSessionsByAsn, handleDn42Lookup, handleDeleteSession, handleAuthChallenge, handleVerifySsh, handleAuthStatus, handleLoginPassword, handleSetPassword, handleRequestOtp, handleVerifyOtp, handleAuthMe, handlePeerStatus, handleLookingGlassQuery } from './server/apiHandler.js';

function telegramApiPlugin(): Plugin {
  const handler = async (req: any, res: any, next: any) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    const parseBody = () => new Promise<any>((resolve) => {
      let body = '';
      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', () => {
        try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
      });
    });

    const sendJson = (status: number, data: any) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    };

    // 1. POST /api/submit-peering
    if (url.pathname === '/api/submit-peering' && req.method === 'POST') {
      const parsed = await parseBody();
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      const authHeader = req.headers['authorization'];
      const result = await handlePeeringSubmission(parsed, Array.isArray(clientIp) ? clientIp[0] : clientIp, authHeader);
      return sendJson(result.status, result.data);
    }

    // 2. GET /api/node-ports
    if (url.pathname === '/api/node-ports' && req.method === 'GET') {
      const nodeId = url.searchParams.get('nodeId') || 'jp07';
      const result = handleGetOccupiedPorts(nodeId);
      return sendJson(result.status, result.data);
    }

    // 3. GET /api/session
    if (url.pathname === '/api/session' && req.method === 'GET') {
      const id = url.searchParams.get('id');
      const authHeader = req.headers['authorization'];
      const result = handleGetSession(id, authHeader);
      return sendJson(result.status, result.data);
    }

    // 4. GET /api/sessions-by-asn
    if (url.pathname === '/api/sessions-by-asn' && req.method === 'GET') {
      const asn = url.searchParams.get('asn');
      const authHeader = req.headers['authorization'];
      const result = handleGetSessionsByAsn(asn, authHeader);
      return sendJson(result.status, result.data);
    }

    // 5. GET /api/dn42-lookup
    if (url.pathname === '/api/dn42-lookup' && req.method === 'GET') {
      const asn = url.searchParams.get('asn');
      const result = await handleDn42Lookup(asn);
      return sendJson(result.status, result.data);
    }

    // 5.1 POST /api/delete-session
    if (url.pathname === '/api/delete-session' && req.method === 'POST') {
      const parsed = await parseBody();
      const authHeader = req.headers['authorization'];
      const result = await handleDeleteSession(parsed, authHeader);
      return sendJson(result.status, result.data);
    }

    // 6. POST /api/auth/challenge
    if (url.pathname === '/api/auth/challenge' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = await handleAuthChallenge(parsed);
      return sendJson(result.status, result.data);
    }

    // 7. POST /api/auth/verify-ssh
    if (url.pathname === '/api/auth/verify-ssh' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = await handleVerifySsh(parsed);
      return sendJson(result.status, result.data);
    }

    // 8. POST /api/auth/status
    if (url.pathname === '/api/auth/status' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = await handleAuthStatus(parsed);
      return sendJson(result.status, result.data);
    }

    // 9. POST /api/auth/login-password
    if (url.pathname === '/api/auth/login-password' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = await handleLoginPassword(parsed);
      return sendJson(result.status, result.data);
    }

    // 10. POST /api/auth/set-password
    if (url.pathname === '/api/auth/set-password' && req.method === 'POST') {
      const parsed = await parseBody();
      const authHeader = req.headers['authorization'];
      const result = await handleSetPassword(parsed, authHeader);
      return sendJson(result.status, result.data);
    }

    // 11. POST /api/auth/request-otp
    if (url.pathname === '/api/auth/request-otp' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = await handleRequestOtp(parsed);
      return sendJson(result.status, result.data);
    }

    // 12. POST /api/auth/verify-otp
    if (url.pathname === '/api/auth/verify-otp' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = await handleVerifyOtp(parsed);
      return sendJson(result.status, result.data);
    }

    // 13. GET /api/auth/me
    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      const authHeader = req.headers['authorization'];
      const result = handleAuthMe(authHeader);
      return sendJson(result.status, result.data);
    }

    // 14. GET /api/peer-status
    if (url.pathname === '/api/peer-status' && req.method === 'GET') {
      const asn = url.searchParams.get('asn');
      const node = url.searchParams.get('node');
      const name = url.searchParams.get('name');
      const result = await handlePeerStatus(asn, node, name);
      return sendJson(result.status, result.data);
    }

    // 15. POST /api/looking-glass/query
    if (url.pathname === '/api/looking-glass/query' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = await handleLookingGlassQuery(parsed);
      return sendJson(result.status, result.data);
    }

    next();
  };

  return {
    name: 'telegram-api-plugin',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 3143,
    host: true,
  },
  preview: {
    port: 3143,
    host: true,
  },
  plugins: [
    tailwindcss(),
    react(),
    telegramApiPlugin(),
  ],
});
