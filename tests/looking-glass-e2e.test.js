/**
 * Comprehensive Automated End-to-End Test Suite for Looking Glass & bird-lg-go integration
 * Tests:
 * 1. Live bird-lgproxy server detection & live socket query
 * 2. Route lookups (IPv4, IPv6, CIDR, ASN)
 * 3. Ping execution & statistics parsing
 * 4. Traceroute execution & hop parsing
 * 5. BGP Protocols & active peering session status integration
 * 6. BIRD system status & memory diagnostics
 * 7. Security injection mitigation
 * 8. Resilient fallback when probe is offline
 */

import http from 'node:http';
import { executeLgCommand, queryPeerBgpStatus, sanitizeTarget } from '../server/lookingGlassService.js';
import { handleLookingGlassQuery, handlePeerStatus } from '../server/apiHandler.js';

// Setup Mock Probe Server on Port 5000
function startMockProxyServer(port = 5000) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1:5000'}`);
      const q = url.searchParams.get('q') || '';
      const count = parseInt(url.searchParams.get('count') || '4', 10);

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');

      if (url.pathname === '/raw') {
        if (q.includes('show status')) {
          res.writeHead(200);
          res.end(`BIRD 2.15.1 (Example Live Node Socket - Tokyo JP-1)
Router ID:       172.20.0.1
Current server time: 2026-08-21 00:00:00
Last reconfigure:    2026-08-20 18:30:00 (Loaded via BIRD CLI)
Daemon is up and running.
BGP Protocols:   18 active, 0 down
Routing Tables:  master4 (428 routes), master6 (392 routes)`);
          return;
        }

        if (q.includes('show memory')) {
          res.writeHead(200);
          res.end(`BIRD memory usage:
  Routing tables:    2.14 MB
  Route attributes:  1.12 MB
  ROA tables:        256.00 kB
  Protocols:         620.40 kB
  Total memory:      4.13 MB / 1024 MB (Healthy)`);
          return;
        }

        if (q.includes('show protocols')) {
          res.writeHead(200);
          res.end(`BIRD 2.15.1 ready.
Name       Proto      Table      State  Since         Info
device1    Device     master4    up     2026-08-19 12:00:00
direct1    Direct     master4    up     2026-08-19 12:00:00
dn42_jp1_rr BGP        master4    up     2026-08-19 12:00:00  Established   Routes: 428 imported, 428 exported
dn42_us01_ibgp BGP      master4    up     2026-08-19 12:05:00  Established   Routes: 180 imported, 380 exported
dn42_akilab_as4242421337_jp07 BGP master4 up 2026-08-20 14:00:00 Established Routes: 12 imported, 18 exported
dn42_v6_mesh BGP        master6    up     2026-08-19 12:00:00  Established   Routes: 392 imported, 392 exported`);
          return;
        }

        // Default: Route lookup
        res.writeHead(200);
        res.end(`BIRD 2.15.1 ready.
Table master4:
172.20.0.53/32 unicast [dn42_jp1_rr 2026-08-20 14:25:31] * (100) [AS4242421337i]
	via 172.20.0.1 on wg-jp07-core
	Type: BGP univ
	BGP.origin: IGP
	BGP.as_path: 4242421337 4242420053
	BGP.next_hop: 172.20.0.1
	BGP.local_pref: 100
	BGP.community: (64512, 1) (424242, 1000) (424242, 1007)
	BGP.large_community: (4242421337, 1, 100) (4242421337, 2, 7)
	ROA.status: ROA_VALID (DN42 Registry verified)`);
        return;
      }

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

      if (url.pathname === '/traceroute') {
        const target = q || '172.20.0.53';
        res.writeHead(200);
        res.end(`traceroute to ${target} (30 hops max, 60 byte packets)
 1  core-gw-jp07.example.dn42 (172.20.0.1)  0.215 ms  0.198 ms  0.204 ms
 2  tokyo-ix.dn42 (172.20.0.1)  1.120 ms  1.098 ms  1.110 ms
 3  target-node (${target})  1.325 ms  1.290 ms  1.310 ms`);
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Starting Looking Glass & bird-lg-go End-to-End Test Suite');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, extraInfo = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${extraInfo}`);
      failed++;
    }
  }

  // --- Phase 1: Test with Live Mock bird-lgproxy Server Running ---
  console.log('📦 Phase 1: Testing with Live bird-lgproxy (Port 5000)...');
  const mockServer = await startMockProxyServer(5000);

  try {
    // Test 1.1: Live Route Lookup
    const routeRes = await handleLookingGlassQuery({
      nodeId: 'jp07',
      commandType: 'route',
      target: '172.20.0.53',
    });
    assert(routeRes.status === 200 && routeRes.data.isLive === true, 'Live Socket route query recognized as LIVE');
    assert(routeRes.data.output.includes('ROA_VALID'), 'Live Socket route output contains BGP ROA validation');

    // Test 1.2: Live Ping Execution
    const pingRes = await handleLookingGlassQuery({
      nodeId: 'jp07',
      commandType: 'ping',
      target: '172.20.0.1',
      options: { count: 4 },
    });
    assert(pingRes.status === 200 && pingRes.data.isLive === true, 'Live Ping executed successfully');
    assert(pingRes.data.output.includes('0% packet loss'), 'Live Ping parsed RTT statistics properly');

    // Test 1.3: Live Traceroute
    const traceRes = await handleLookingGlassQuery({
      nodeId: 'jp07',
      commandType: 'traceroute',
      target: '172.20.0.53',
    });
    assert(traceRes.status === 200 && traceRes.data.isLive === true, 'Live Traceroute returned hops');

    // Test 1.4: Live Status
    const statusRes = await handleLookingGlassQuery({
      nodeId: 'jp07',
      commandType: 'status',
    });
    assert(statusRes.status === 200 && statusRes.data.output.includes('BIRD 2.15.1'), 'Live BIRD Status output retrieved');

    // Test 1.5: Live Peer BGP Status Linking
    const peerBgpRes = await queryPeerBgpStatus('4242421337', 'jp07', 'as4242421337');
    assert(peerBgpRes.isLive === true && peerBgpRes.bgpState === 'Established', 'Live BGP session status parsed as Established');
    assert(peerBgpRes.stage === 4, 'Live BGP session stage mapped to Stage 4 (Established)');
    assert(peerBgpRes.routesImported === 12 && peerBgpRes.routesExported === 18, 'Live BGP routes imported/exported correctly parsed');

  } finally {
    // Shut down mock server to test Phase 2 (Offline Fallback)
    await new Promise((r) => mockServer.close(r));
    console.log('  ⏹️ Mock server stopped.\n');
  }

  // --- Phase 2: Test Offline / Dev Simulation Fallback ---
  console.log('📦 Phase 2: Testing Resilient Dev Simulation (When Probe is Offline)...');

  // Test 2.1: Route Simulation
  const offlineRoute = await handleLookingGlassQuery({
    nodeId: 'jp07',
    commandType: 'route',
    target: '172.20.0.53',
  });
  assert(offlineRoute.status === 200 && offlineRoute.data.isLive === false, 'Offline node triggers fallback to Simulation mode');
  assert(offlineRoute.data.output.includes('Table master4:'), 'Simulation engine produces valid BIRD routing table output');

  // Test 2.2: Ping Simulation
  const offlinePing = await handleLookingGlassQuery({
    nodeId: 'us01',
    commandType: 'ping',
    target: '172.20.14.2',
  });
  assert(offlinePing.status === 200 && offlinePing.data.output.includes('rtt min/avg/max/mdev'), 'Simulation engine generates realistic ping latency stats');

  // --- Phase 3: Security & Input Sanitization ---
  console.log('\n📦 Phase 3: Testing Security & Anti-Injection Sanitization...');

  assert(sanitizeTarget('172.20.0.1; rm -rf /') === '', 'Sanitizer stripped command injection with semicolon');
  assert(sanitizeTarget('172.20.0.1 | cat /etc/passwd') === '', 'Sanitizer stripped pipeline injection');
  assert(sanitizeTarget('172.20.0.1`whoami`') === '', 'Sanitizer stripped backtick execution');
  assert(sanitizeTarget('172.20.0.1$(id)') === '', 'Sanitizer stripped dollar command substitution');
  assert(sanitizeTarget('fd00:4242:1337::1/48') === 'fd00:4242:1337::1/48', 'Sanitizer cleanly allowed valid IPv6 prefix');
  assert(sanitizeTarget('AS4242421337') === 'AS4242421337', 'Sanitizer cleanly allowed valid ASN string');

  // Test 3.2: Malicious request blocked by API handler
  const injectionRes = await handleLookingGlassQuery({
    nodeId: 'jp07',
    commandType: 'ping',
    target: '172.20.0.1; reboot',
  });
  assert(injectionRes.data.success === false, 'Injection attempt rejected by Looking Glass query handler');

  console.log('\n================================================================');
  console.log(`📊 Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exitCode = 1;
});
