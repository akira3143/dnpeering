/**
 * System-Level WireGuard Baseline Port Scanner
 * 
 * Multi-layer Deep Discovery Engine:
 * 1. WireGuard Kernel State (`wg show all listen-port`)
 * 2. WireGuard Configuration Files (`/etc/wireguard/*.conf`)
 * 3. Linux Socket Inspection (`ss -ulnp` / `netstat -ulnp`)
 * 4. Linux Kernel Procfs (`/proc/net/udp`, `/proc/net/udp6`) - readable by non-root
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Baseline scan of existing WireGuard interfaces and configuration files
 * @returns {Array<{port: number, name: string, label: string, type: string, status: string, source: string}>}
 */
export function scanBaselineExistingPorts() {
  const detectedMap = new Map();

  // 1. Scan `/etc/wireguard/*.conf` configuration files
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
          } catch {}
        }
      }
    }
  } catch {}

  // 2. Scan via `wg show all listen-port` (Kernel WireGuard active interfaces)
  try {
    const wgOutput = execFileSync('wg', ['show', 'all', 'listen-port'], { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
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

  // 3. Scan via `ss -ulnp` (Socket statistics for UDP listening ports in 10000-65535)
  try {
    const ssOutput = execFileSync('ss', ['-ulnp'], { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
    const ssLines = ssOutput.trim().split('\n');
    for (const line of ssLines) {
      const match = line.match(/:(\d{5})\s+/);
      if (match && match[1]) {
        const port = parseInt(match[1], 10);
        if (!isNaN(port) && port >= 10000 && port <= 65535 && !detectedMap.has(port)) {
          // Extract process name or interface if present
          let name = 'udp_service';
          const procMatch = line.match(/users:\(\("([^"]+)"/);
          if (procMatch && procMatch[1]) {
            name = procMatch[1];
          }
          detectedMap.set(port, {
            port,
            name,
            label: `${name} : ${port}`,
            type: 'in_use',
            status: 'existing',
            source: 'system_socket',
          });
        }
      }
    }
  } catch {}

  // 4. Scan Linux Procfs (/proc/net/udp and /proc/net/udp6) - 100% accessible to non-root users
  const procFiles = ['/proc/net/udp', '/proc/net/udp6'];
  for (const procPath of procFiles) {
    try {
      if (fs.existsSync(procPath)) {
        const content = fs.readFileSync(procPath, 'utf-8');
        const lines = content.trim().split('\n');
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].trim().split(/\s+/);
          if (parts.length >= 2) {
            const localAddr = parts[1]; // e.g. "00000000:5DC7"
            const colonIdx = localAddr.indexOf(':');
            if (colonIdx !== -1) {
              const hexPort = localAddr.slice(colonIdx + 1);
              const port = parseInt(hexPort, 16);
              if (!isNaN(port) && port >= 10000 && port <= 65535 && !detectedMap.has(port)) {
                detectedMap.set(port, {
                  port,
                  name: `udp_in_use`,
                  label: `UDP监听 : ${port}`,
                  type: 'in_use',
                  status: 'existing',
                  source: 'procfs_udp',
                });
              }
            }
          }
        }
      }
    } catch {}
  }

  return Array.from(detectedMap.values());
}
