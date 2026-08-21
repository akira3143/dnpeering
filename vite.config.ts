import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function telegramApiPlugin(): Plugin {
  let apiModule: any = null;

  const getApi = async () => {
    if (!apiModule) {
      // Dynamic import ensures backend code is never loaded/executed during production `vite build`
      // @ts-ignore
      apiModule = await import('./server/apiHandler.js');
    }
    return apiModule;
  };

  const handler = async (req: any, res: any, next: any) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (!url.pathname.startsWith('/api/')) {
      return next();
    }

    const api = await getApi();

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
      const result = await api.handlePeeringSubmission(parsed, Array.isArray(clientIp) ? clientIp[0] : clientIp, authHeader);
      return sendJson(result.status, result.data);
    }

    // 2. GET /api/node-ports
    if (url.pathname === '/api/node-ports' && req.method === 'GET') {
      const nodeId = url.searchParams.get('nodeId') || 'jp07';
      const result = api.handleGetOccupiedPorts(nodeId);
      return sendJson(result.status, result.data);
    }

    // 3. GET /api/session
    if (url.pathname === '/api/session' && req.method === 'GET') {
      const id = url.searchParams.get('id');
      const authHeader = req.headers['authorization'];
      const result = api.handleGetSession(id, authHeader);
      return sendJson(result.status, result.data);
    }

    // 4. GET /api/sessions-by-asn
    if (url.pathname === '/api/sessions-by-asn' && req.method === 'GET') {
      const asn = url.searchParams.get('asn');
      const authHeader = req.headers['authorization'];
      const result = api.handleGetSessionsByAsn(asn, authHeader);
      return sendJson(result.status, result.data);
    }

    // 5. GET /api/dn42-lookup
    if (url.pathname === '/api/dn42-lookup' && req.method === 'GET') {
      const asn = url.searchParams.get('asn');
      const result = await api.handleDn42Lookup(asn);
      return sendJson(result.status, result.data);
    }

    // 5.1 POST /api/delete-session
    if (url.pathname === '/api/delete-session' && req.method === 'POST') {
      const parsed = await parseBody();
      const authHeader = req.headers['authorization'];
      const result = await api.handleDeleteSession(parsed, authHeader);
      return sendJson(result.status, result.data);
    }

    // 6. POST /api/auth/challenge
    if (url.pathname === '/api/auth/challenge' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = await api.handleAuthChallenge(parsed);
      return sendJson(result.status, result.data);
    }

    // 7. POST /api/auth/verify-ssh
    if (url.pathname === '/api/auth/verify-ssh' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = await api.handleVerifySsh(parsed);
      return sendJson(result.status, result.data);
    }

    // 8. POST /api/auth/status
    if (url.pathname === '/api/auth/status' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = await api.handleAuthStatus(parsed);
      return sendJson(result.status, result.data);
    }

    // 9. POST /api/auth/login-password
    if (url.pathname === '/api/auth/login-password' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = await api.handleLoginPassword(parsed);
      return sendJson(result.status, result.data);
    }

    // 10. POST /api/auth/set-password
    if (url.pathname === '/api/auth/set-password' && req.method === 'POST') {
      const parsed = await parseBody();
      const authHeader = req.headers['authorization'];
      const result = await api.handleSetPassword(parsed, authHeader);
      return sendJson(result.status, result.data);
    }

    // 11. POST /api/auth/request-otp
    if (url.pathname === '/api/auth/request-otp' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = await api.handleRequestOtp(parsed);
      return sendJson(result.status, result.data);
    }

    // 12. POST /api/auth/verify-otp
    if (url.pathname === '/api/auth/verify-otp' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = await api.handleVerifyOtp(parsed);
      return sendJson(result.status, result.data);
    }

    // 13. GET /api/auth/me
    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      const authHeader = req.headers['authorization'];
      const result = api.handleAuthMe(authHeader);
      return sendJson(result.status, result.data);
    }

    // 14. GET /api/peer-status
    if (url.pathname === '/api/peer-status' && req.method === 'GET') {
      const asn = url.searchParams.get('asn');
      const node = url.searchParams.get('node');
      const name = url.searchParams.get('name');
      const result = await api.handlePeerStatus(asn, node, name);
      return sendJson(result.status, result.data);
    }

    // 15. POST /api/looking-glass/query
    if (url.pathname === '/api/looking-glass/query' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = await api.handleLookingGlassQuery(parsed);
      return sendJson(result.status, result.data);
    }

    // 16. GET /api/network-meta (Dynamic Unified Config)
    if (url.pathname === '/api/network-meta' && req.method === 'GET') {
      const result = api.handleGetNetworkMeta();
      return sendJson(result.status, result.data);
    }

    // 17. POST /api/probe/report-ports
    if (url.pathname === '/api/probe/report-ports' && req.method === 'POST') {
      const parsed = await parseBody();
      const result = api.handleReportProbePorts(parsed, req.headers['authorization']);
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
    port: 4242,
    host: true,
  },
  preview: {
    port: 4242,
    host: true,
  },
  plugins: [
    tailwindcss(),
    react(),
    telegramApiPlugin(),
  ],
});
