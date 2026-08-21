/**
 * System-Level WireGuard Baseline Port Scanner
 * 
 * Executed ONCE at server startup (or on-demand via `dnp scan`).
 * Scans Linux kernel WireGuard interfaces and /etc/wireguard/*.conf to detect pre-existing peers.
 * Standard format: "服务器或wg隧道名 + 端口号" (e.g., "wg-peer-4242421234 : 21234").
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Baseline scan of existing WireGuard interfaces and configuration files
 * @returns {Array<{port: number, name: string, label: string, type: string, status: string, source: string}>}
 */
export function scanBaselineExistingPorts() {
  const detectedMap = new Map();

  // 1. Scan via `wg show all listen-port` (Kernel WireGuard active interfaces)
  try {
    const wgOutput = execSync('wg show all listen-port 2>/dev/null', { encoding: 'utf-8', timeout: 2000 });
    const lines = wgOutput.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const ifaceName = parts[0];
        const port = parseInt(parts[1], 10);
        if (!isNaN(port) && port >= 10000 && port <= 65535) {
          detectedMap.set(port, {
            port,
            name: ifaceName,
            label: `${ifaceName} : ${port}`,
            type: 'in_use',
            status: 'existing',
            source: 'kernel_wg',
          });
        }
      }
    }
  } catch {}

  // 2. Scan `/etc/wireguard/*.conf` configuration files
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
                if (!detectedMap.has(port)) {
                  detectedMap.set(port, {
                    port,
                    name: ifaceName,
                    label: `${ifaceName} : ${port}`,
                    type: 'in_use',
                    status: 'existing',
                    source: 'wireguard_conf',
                  });
                }
              }
            }
          } catch {}
        }
      }
    }
  } catch {}

  return Array.from(detectedMap.values());
}
