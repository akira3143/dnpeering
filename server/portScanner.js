/**
 * System-Level Port Scanner Engine
 * 
 * Uses system `ss -tulnp` to scan all listening UDP/TCP sockets,
 * paired with WireGuard interface mapping from `/etc/wireguard/*.conf` and `wg show`.
 * 
 * Standard Format: "服务名/隧道名 + 端口" (e.g. "dn42_cow_jp : 23999").
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Baseline scan of existing WireGuard interfaces and system socket listeners
 * @returns {Array<{port: number, name: string, label: string, type: string, status: string, source: string}>}
 */
export function scanBaselineExistingPorts() {
  const detectedMap = new Map();
  const wgNameMap = new Map();

  // 1. Map WireGuard configs from /etc/wireguard/*.conf
  try {
    const wgConfDir = '/etc/wireguard';
    if (fs.existsSync(wgConfDir)) {
      const files = fs.readdirSync(wgConfDir);
      for (const file of files) {
        if (file.endsWith('.conf')) {
          const ifaceName = file.replace(/\.conf$/, '');
          try {
            const content = fs.readFileSync(path.join(wgConfDir, file), 'utf-8');
            const match = content.match(/ListenPort\s*=\s*(\d+)/i);
            if (match && match[1]) {
              const port = parseInt(match[1], 10);
              if (!isNaN(port) && port >= 10000 && port <= 65535) {
                wgNameMap.set(port, ifaceName);
              }
            }
          } catch {}
        }
      }
    }
  } catch {}

  // 2. Map active WireGuard kernel interfaces via `wg show all listen-port`
  try {
    const wgOutput = execFileSync('wg', ['show', 'all', 'listen-port'], { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = wgOutput.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const ifaceName = parts[0];
        const port = parseInt(parts[1], 10);
        if (!isNaN(port) && port >= 10000 && port <= 65535) {
          wgNameMap.set(port, ifaceName);
        }
      }
    }
  } catch {}

  // 3. Primary Core Scanner: `ss -tulnp`
  try {
    const ssOutput = execFileSync('ss', ['-tulnp'], { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = ssOutput.trim().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('Netid')) continue;

      // Extract Port from Local Address:Port (e.g. 0.0.0.0:23999, :::20207, [::]:50001, *:443)
      const portMatch = trimmed.match(/(?:[0-9a-fA-F:.]+|\*):(\d{1,5})\s+/);
      if (!portMatch || !portMatch[1]) continue;

      const port = parseInt(portMatch[1], 10);
      if (isNaN(port) || port < 10000 || port > 65535) continue;

      // Extract Process Name from Process column: users:(("bird",pid=827,fd=12))
      let procName = '';
      const procMatch = trimmed.match(/users:\(\("([^"]+)"/);
      if (procMatch && procMatch[1]) {
        procName = procMatch[1].trim();
      }

      // Determine clean service name
      let serviceName = '';
      let source = 'system_socket';

      if (wgNameMap.has(port)) {
        serviceName = wgNameMap.get(port);
        source = 'wireguard';
      } else if (procName) {
        serviceName = procName;
        source = 'process';
      } else {
        serviceName = 'wireguard';
        source = 'kernel_wg';
      }

      const label = `${serviceName} : ${port}`;

      detectedMap.set(port, {
        port,
        name: serviceName,
        label,
        type: 'in_use',
        status: 'existing',
        source,
      });
    }
  } catch {}

  // 4. Register all WireGuard interfaces even if inactive at scan moment
  for (const [port, ifaceName] of wgNameMap.entries()) {
    if (!detectedMap.has(port)) {
      detectedMap.set(port, {
        port,
        name: ifaceName,
        label: `${ifaceName} : ${port}`,
        type: 'in_use',
        status: 'existing',
        source: 'wireguard',
      });
    }
  }

  // 5. Procfs UDP fallback for non-root runtime environments
  const procFiles = ['/proc/net/udp', '/proc/net/udp6'];
  for (const procPath of procFiles) {
    try {
      if (fs.existsSync(procPath)) {
        const content = fs.readFileSync(procPath, 'utf-8');
        const lines = content.trim().split('\n');
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].trim().split(/\s+/);
          if (parts.length >= 2) {
            const localAddr = parts[1];
            const colonIdx = localAddr.indexOf(':');
            if (colonIdx !== -1) {
              const hexPort = localAddr.slice(colonIdx + 1);
              const port = parseInt(hexPort, 16);
              if (!isNaN(port) && port >= 10000 && port <= 65535 && !detectedMap.has(port)) {
                const serviceName = wgNameMap.get(port) || 'wireguard';
                detectedMap.set(port, {
                  port,
                  name: serviceName,
                  label: `${serviceName} : ${port}`,
                  type: 'in_use',
                  status: 'existing',
                  source: 'procfs',
                });
              }
            }
          }
        }
      }
    } catch {}
  }

  return Array.from(detectedMap.values()).sort((a, b) => a.port - b.port);
}
