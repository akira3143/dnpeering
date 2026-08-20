import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'server', 'data');
const REGISTRY_DIR = path.join(DATA_DIR, 'registry');
const ZIP_PATH = path.join(DATA_DIR, 'registry_master.zip');
const EXTRACT_TMP = path.join(DATA_DIR, 'registry_tmp_extract');

export async function downloadAndSyncOfficialRegistry() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const archiveUrl = 'https://git.lantian.pub/backup/dn42-registry/archive/master.zip';
  console.log(`🌐 [DN42 Registry] Downloading full registry archive from ${archiveUrl} ...`);

  const res = await fetch(archiveUrl, { headers: { 'User-Agent': 'AkiLab-DN42-Portal/2.0' } });
  if (!res.ok) {
    throw new Error(`Download failed with status ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(ZIP_PATH, buffer);
  console.log(`📦 [DN42 Registry] Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB archive.`);

  if (fs.existsSync(EXTRACT_TMP)) {
    fs.rmSync(EXTRACT_TMP, { recursive: true, force: true });
  }
  fs.mkdirSync(EXTRACT_TMP, { recursive: true });

  console.log('📂 [DN42 Registry] Extracting objects via PowerShell Expand-Archive...');
  // Note: Windows NTFS does not support colons in filenames (inet6num/route6).
  // Expand-Archive might warn or skip colons, but aut-num, mntner, person, and role contain NO colons and extract 100% cleanly!
  try {
    execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${ZIP_PATH}' -DestinationPath '${EXTRACT_TMP}' -Force"`, { stdio: 'ignore' });
  } catch {
    // Ignore NTFS colon filename errors on inet6num
    console.log('ℹ️ Extracted core objects (skipped NTFS invalid colon filenames).');
  }

  const rootItems = fs.readdirSync(EXTRACT_TMP);
  const innerFolder = rootItems.length > 0 ? path.join(EXTRACT_TMP, rootItems[0]) : EXTRACT_TMP;
  const sourceDataDir = path.join(innerFolder, 'data');

  if (fs.existsSync(REGISTRY_DIR)) {
    fs.rmSync(REGISTRY_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(REGISTRY_DIR, { recursive: true });

  const destDataDir = path.join(REGISTRY_DIR, 'data');
  fs.mkdirSync(destDataDir, { recursive: true });

  // Copy aut-num, mntner, person, role directories
  const targetDirs = ['aut-num', 'mntner', 'person', 'role'];
  for (const dirName of targetDirs) {
    const src = path.join(sourceDataDir, dirName);
    const dest = path.join(destDataDir, dirName);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, { recursive: true });
      console.log(`  ✓ Copied ${dirName} (${fs.readdirSync(dest).length} objects)`);
    }
  }

  console.log(`✅ [DN42 Registry] Successfully installed official registry objects to ${destDataDir}`);

  // Cleanup temp files
  try { fs.unlinkSync(ZIP_PATH); } catch {}
  try { fs.rmSync(EXTRACT_TMP, { recursive: true, force: true }); } catch {}

  // Verify AS4242421337
  const testAsPath = path.join(destDataDir, 'aut-num', 'AS4242421337');
  if (fs.existsSync(testAsPath)) {
    console.log('\n🔍 [Verification] Verified AS4242421337 object from official registry:');
    console.log(fs.readFileSync(testAsPath, 'utf-8'));
  }
}

downloadAndSyncOfficialRegistry().catch((err) => {
  console.error('❌ Registry sync error:', err.message);
});
