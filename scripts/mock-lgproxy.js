/**
 * Local Development Mock bird-lgproxy Server
 * Simulates a live bird-lgproxy (xddxdd/bird-lg-go) running on port 5000
 * Use this to verify that the Looking Glass live HTTP client, headers, and parsing work 100% on Windows
 *
 * Usage: node scripts/mock-lgproxy.js
 */

import http from 'node:http';

const PORT = 5000;
const TOKEN = process.env.LG_PROXY_TOKEN || '';

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1:5000'}`);
  const q = url.searchParams.get('q') || '';
  const count = parseInt(url.searchParams.get('count') || '4', 10);
  const authHeader = req.headers['authorization'] || req.headers['x-bird-lg-token'];

  // Token validation if set
  if (TOKEN && (!authHeader || (!authHeader.includes(TOKEN) && authHeader !== TOKEN))) {
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('Unauthorized: Invalid or missing token');
    return;
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  // 1. Raw BIRD socket query (/raw?q=...)
  if (url.pathname === '/raw') {
    if (q.startsWith('show status')) {
      res.writeHead(200);
      res.end(`BIRD 2.15.1 (AkiLab Live Node Socket - Tokyo JP-7)
Router ID:       172.20.188.7
Current server time: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}
Last reconfigure:    2026-08-20 18:30:00 (Loaded via BIRD CLI)
Daemon is up and running.
BGP Protocols:   18 active, 0 down
Routing Tables:  master4 (428 routes), master6 (392 routes)`);
      return;
    }

    if (q.startsWith('show memory')) {
      res.writeHead(200);
      res.end(`BIRD memory usage:
  Routing tables:    2.14 MB
  Route attributes:  1.12 MB
  ROA tables:        256.00 kB
  Protocols:         620.40 kB
  Total memory:      4.13 MB / 1024 MB (Healthy)`);
      return;
    }

    if (q.startsWith('show protocols')) {
      res.writeHead(200);
      res.end(`BIRD 2.15.1 ready.
Name       Proto      Table      State  Since         Info
device1    Device     master4    up     2026-08-19 12:00:00
direct1    Direct     master4    up     2026-08-19 12:00:00
dn42_jp7_rr BGP        master4    up     2026-08-19 12:00:00  Established   Routes: 428 imported, 428 exported
dn42_us01_ibgp BGP      master4    up     2026-08-19 12:05:00  Established   Routes: 180 imported, 380 exported
dn42_akilab_as4242421337_jp07 BGP master4 up 2026-08-20 14:00:00 Established Routes: 12 imported, 18 exported
dn42_v6_mesh BGP        master6    up     2026-08-19 12:00:00  Established   Routes: 392 imported, 392 exported`);
      return;
    }

    // Default: Route query
    res.writeHead(200);
    res.end(`BIRD 2.15.1 ready.
Table master4:
${q.replace(/show route (for )?/i, '').trim() || '172.20.0.53/32'} unicast [dn42_jp7_rr 2026-08-20 14:25:31] * (100) [AS4242423143i]
	via 172.20.188.7 on wg-jp07-core
	Type: BGP univ
	BGP.origin: IGP
	BGP.as_path: 4242423143 4242420053
	BGP.next_hop: 172.20.188.7
	BGP.local_pref: 100
	BGP.community: (64512, 1) (424242, 1000) (424242, 1007)
	BGP.large_community: (4242423143, 1, 100) (4242423143, 2, 7)
	ROA.status: ROA_VALID (DN42 Registry verified)`);
    return;
  }

  // 2. Ping command (/ping?q=...&count=...)
  if (url.pathname === '/ping') {
    const target = q || '172.20.0.53';
    res.writeHead(200);
    res.end(`PING ${target} (${target}) 56 data bytes
64 bytes from ${target}: icmp_seq=1 ttl=64 time=1.412 ms
64 bytes from ${target}: icmp_seq=2 ttl=64 time=1.285 ms
64 bytes from ${target}: icmp_seq=3 ttl=64 time=1.340 ms
64 bytes from ${target}: icmp_seq=4 ttl=64 time=1.298 ms

--- ${target} ping statistics ---
${count} packets transmitted, ${count} received, 0% packet loss, time 3003ms
rtt min/avg/max/mdev = 1.285/1.333/1.412/0.052 ms`);
    return;
  }

  // 3. Traceroute command (/traceroute?q=...)
  if (url.pathname === '/traceroute') {
    const target = q || '172.20.0.53';
    res.writeHead(200);
    res.end(`traceroute to ${target} (30 hops max, 60 byte packets)
 1  core-gw-jp07.akilab.dn42 (172.20.188.7)  0.215 ms  0.198 ms  0.204 ms
 2  tokyo-ix.dn42 (172.20.0.1)  1.120 ms  1.098 ms  1.110 ms
 3  target-node (${target})  1.325 ms  1.290 ms  1.310 ms`);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🚀 [Mock bird-lgproxy] Running at http://127.0.0.1:${PORT}`);
  console.log(`💡 Portal Looking Glass will automatically detect this and switch to [🟢 LIVE SOCKET] mode!`);
  console.log(`Press Ctrl+C to stop.\n`);
});
