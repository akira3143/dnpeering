import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const REGISTRY_DIR = path.join(DATA_DIR, 'registry');
const REGISTRY_DATA_DIR = path.join(REGISTRY_DIR, 'data');
const RAW_MIRROR_BASE = 'https://git.lantian.pub/backup/dn42-registry/raw/branch/master/data';

// Sync Interval: Configurable between 3 to 6 hours (Default: 4 hours)
const envHours = parseFloat(process.env.REGISTRY_SYNC_INTERVAL_HOURS || '4');
const SYNC_INTERVAL_HOURS = Math.min(6, Math.max(3, isNaN(envHours) ? 4 : envHours));
const SYNC_INTERVAL_MS = SYNC_INTERVAL_HOURS * 60 * 60 * 1000;

console.log(`⏱️ [DN42 Registry] Periodic sync scheduled every ${SYNC_INTERVAL_HOURS} hours.`);

/**
 * Triggers background sync script silently
 */
export function triggerBackgroundSync() {
  const syncScript = path.join(ROOT_DIR, 'scripts', 'sync_registry.py');
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  exec(`${pythonCmd} "${syncScript}"`, (err, stdout, stderr) => {
    if (err) {
      console.warn(`[DN42 Registry] Background sync warning:`, stderr || err.message);
    } else {
      console.log(`[DN42 Registry] Background sync completed successfully.`);
    }
  });
}

// Run periodic sync every 3-6 hours (Default: 4h)
setInterval(() => {
  console.log(`🔄 [DN42 Registry] Starting periodic ${SYNC_INTERVAL_HOURS}-hour sync...`);
  triggerBackgroundSync();
}, SYNC_INTERVAL_MS);

/**
 * Parses simple RPSL format file (DN42 registry object) into a key-value dictionary
 */
function parseRpslContent(content) {
  if (!content) return null;
  const result = {};

  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('%')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
      const val = trimmed.slice(colonIdx + 1).trim();

      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(val);
    }
  }

  return result;
}

/**
 * Fetches raw RPSL object from local file or falls back to live Git mirror
 */
async function getRpslObject(category, name) {
  // 1. Try local file
  const localFile = path.join(REGISTRY_DATA_DIR, category, name);
  if (fs.existsSync(localFile)) {
    try {
      const content = fs.readFileSync(localFile, 'utf-8');
      return parseRpslContent(content);
    } catch (err) {
      console.warn(`Error reading local ${category}/${name}:`, err.message);
    }
  }

  // 2. Try remote live mirror (zero-wait for newly registered ASNs)
  try {
    const url = `${RAW_MIRROR_BASE}/${category}/${encodeURIComponent(name)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'AkiLab-DN42-Portal/2.0' } });
    if (res.ok) {
      const text = await res.text();
      return parseRpslContent(text);
    }
  } catch (err) {
    console.warn(`Error fetching remote ${category}/${name}:`, err.message);
  }

  return null;
}

/**
 * Looks up ASN metadata, SSH public keys, and emails directly from DN42 registry
 * @param {string|number} asn 
 * @returns {Promise<{valid: boolean, asn: string, asName: string, descr: string, maintainer: string, adminContact: string, sshKeys: string[], emails: string[], pgpFingerprints: string[], source: string}>}
 */
export async function getAsnIdentity(asn) {
  const cleanAsn = String(asn || '').replace(/\D/g, '');
  if (!cleanAsn) {
    return { valid: false, error: 'ASN 不能为空' };
  }

  const queryAsn = `AS${cleanAsn}`;

  // 1. Fetch aut-num
  const autNum = await getRpslObject('aut-num', queryAsn);

  if (autNum) {
    const asName = autNum['as-name']?.[0] || autNum['descr']?.[0] || queryAsn;
    const descr = autNum['descr']?.[0] || '';
    const maintainer = autNum['mnt-by']?.[0] || '';
    const adminContact = autNum['admin-c']?.[0] || autNum['tech-c']?.[0] || '';

    const sshKeys = [];
    const pgpFingerprints = [];
    const emails = [];

    // 2. Fetch Maintainer object
    if (maintainer) {
      const mntObj = await getRpslObject('mntner', maintainer);
      if (mntObj && mntObj['auth']) {
        for (const authLine of mntObj['auth']) {
          if (authLine.startsWith('ssh-') || authLine.startsWith('ecdsa-')) {
            sshKeys.push(authLine);
          } else if (authLine.startsWith('pgp-fingerprint')) {
            pgpFingerprints.push(authLine.replace(/^pgp-fingerprint\s+/i, '').trim());
          }
        }
      }
    }

    // 3. Fetch Person / Role object for email
    if (adminContact) {
      const personObj = (await getRpslObject('person', adminContact)) || (await getRpslObject('role', adminContact));
      if (personObj && personObj['e-mail']) {
        for (const email of personObj['e-mail']) {
          emails.push(email);
        }
      }
    }

    return {
      valid: true,
      asn: queryAsn,
      asName,
      descr,
      maintainer,
      adminContact,
      sshKeys,
      emails,
      pgpFingerprints,
      source: 'dn42_registry_git',
    };
  }

  // Fallback heuristic if not yet registered in DN42
  const asnNumber = parseInt(cleanAsn, 10);
  const isStandardDn42 = asnNumber >= 4242420000 && asnNumber <= 4242429999;

  return {
    valid: isStandardDn42,
    asn: queryAsn,
    asName: isStandardDn42 ? `DN42-AS${cleanAsn.slice(-4)}` : 'UNKNOWN',
    descr: isStandardDn42 ? 'DN42 Community Member' : 'Private / Unregistered ASN',
    maintainer: isStandardDn42 ? `AS${cleanAsn.slice(-4)}-MNT` : '',
    adminContact: '',
    sshKeys: [],
    emails: [],
    pgpFingerprints: [],
    source: 'fallback_heuristic',
  };
}
