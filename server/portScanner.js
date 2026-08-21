/**
 * System-Level WireGuard & Port Auto-Discovery Engine
 * Automatically scans Linux kernel WireGuard interfaces, /etc/wireguard/*.conf,
 * and active UDP listening sockets to prevent port collisions with pre-existing peers.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getActiveConfig } from './configLoader.js';

let cachedDetectedPorts = [];
let lastScanTimestamp = 0;
const CACHE_TTL_MS = 15000; // Cache for 15 seconds to minimize system calls

/**
 * Scans local Linux system for all active WireGuard listen ports & listening UDP sockets
 * @returns {number[]} Array of occupied port numbers
 */
export function scanLocalSystemOccupiedPorts() {
  const now = Date.now();
  if (now - lastScanTimestamp < CACHE_TTL_MS && cachedDetectedPorts.length > 0) {
    return cachedDetectedPorts;
  }

  const occupiedSet = new Set();

  // 1. Scan via `wg show all listen-port` (Kernel WireGuard state)
  try {
    const wgOutput = execSync('wg show all listen-port 2>/dev/null', { encoding: 'utf-8', timeout: 2000 });
    const lines = wgOutput.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const port = parseInt(parts[1], 10);
        if (!isNaN(port) && port >= 10000 && port <= 65535) {
          occupiedSet.add(port);
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
          try {
            const content = fs.readFileSync(path.join(wgConfDir, file), 'utf-8');
            const match = content.match(/ListenPort\s*=\s*(\d+)/i);
            if (match && match[1]) {
              const port = parseInt(match[1], 10);
              if (!isNaN(port) && port >= 10000 && port <= 65535) {
                occupiedSet.add(port);
              }
            }
          } catch {}
        }
      }
    }
  } catch {}

  // 3. Scan active UDP listening sockets via `ss -ulnH`
  try {
    const ssOutput = execSync('ss -ulnH 2>/dev/null', { encoding: 'utf-8', timeout: 2000 });
    const lines = ssOutput.trim().split('\n');
    for (const line of lines) {
      // Look for port in format: *:21234 or 0.0.0.0:21234 or [::]:21234
      const match = line.match(/:(\d+)\s+/);
      if (match && match[1]) {
        const port = parseInt(match[1], 10);
        if (!isNaN(port) && port >= 10000 && port <= 65535) {
          occupiedSet.add(port);
        }
      }
    }
  } catch {}

  cachedDetectedPorts = Array.from(occupiedSet).sort((a, b) => a - b);
  lastScanTimestamp = now;
  return cachedDetectedPorts;
}

/**
 * Merges all occupied port sources for a specific node:
 * 1. Automatically detected local system WireGuard & UDP ports (if local node)
 * 2. `portal.config.yaml` declared occupied_ports
 * 3. `server/data/port_ledger.json` recorded dynamic sessions
 * @param {string} nodeId 
 * @param {number[]} ledgerPorts 
 * @returns {number[]}
 */
export function getUnifiedOccupiedPorts(nodeId, ledgerPorts = []) {
  const cleanId = String(nodeId || 'jp07').toLowerCase().trim();
  const mergedSet = new Set(ledgerPorts);

  // Source A: Merge from portal.config.yaml
  try {
    const activeCfg = getActiveConfig();
    if (activeCfg && Array.isArray(activeCfg.nodes)) {
      const matched = activeCfg.nodes.find((n) => n.id === cleanId);
      if (matched && Array.isArray(matched.occupiedPorts)) {
        matched.occupiedPorts.forEach((p) => {
          const num = parseInt(p, 10);
          if (!isNaN(num)) mergedSet.add(num);
        });
      }
    }
  } catch {}

  // Source B: Merge from local kernel WireGuard auto-detection (for primary/local hub nodes)
  try {
    const localPorts = scanLocalSystemOccupiedPorts();
    localPorts.forEach((p) => mergedSet.add(p));
  } catch {}

  return Array.from(mergedSet).sort((a, b) => a - b);
}
