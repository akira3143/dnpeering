import urllib.request
import zipfile
import io
import os
import shutil
import sys

# Force UTF-8 output on Windows terminal
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST_REGISTRY_DIR = os.path.join(ROOT_DIR, "server", "data", "registry", "data")

TARGET_PREFIXES = ("data/aut-num/", "data/mntner/", "data/person/", "data/role/")
ARCHIVE_URL = "https://git.lantian.pub/backup/dn42-registry/archive/master.zip"

def sync():
    print(f"[DN42 Registry] Downloading official registry zip from {ARCHIVE_URL}...")
    req = urllib.request.Request(ARCHIVE_URL, headers={"User-Agent": "AkiLab-DN42-Portal/2.0"})
    with urllib.request.urlopen(req) as resp:
        data = resp.read()
    print(f"[DN42 Registry] Downloaded {len(data) / (1024*1024):.2f} MB in memory.")

    if os.path.exists(DEST_REGISTRY_DIR):
        shutil.rmtree(DEST_REGISTRY_DIR)
    os.makedirs(DEST_REGISTRY_DIR, exist_ok=True)

    extracted_count = 0
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for member in z.infolist():
            parts = member.filename.split("/", 1)
            rel_path = parts[1] if len(parts) > 1 else member.filename

            if any(rel_path.startswith(prefix) for prefix in TARGET_PREFIXES) and not member.is_dir():
                dest_file_path = os.path.join(os.path.dirname(DEST_REGISTRY_DIR), rel_path.replace("/", os.sep))
                os.makedirs(os.path.dirname(dest_file_path), exist_ok=True)
                with z.open(member) as src, open(dest_file_path, "wb") as dst:
                    dst.write(src.read())
                extracted_count += 1

    print(f"[DN42 Registry] Successfully extracted {extracted_count} registry objects to {DEST_REGISTRY_DIR}!")

    # Verify AS4242423143
    test_as_file = os.path.join(DEST_REGISTRY_DIR, "aut-num", "AS4242423143")
    if os.path.exists(test_as_file):
        print("\n[Verification] Verified AS4242423143:")
        with open(test_as_file, "r", encoding="utf-8") as f:
            print(f.read())

    test_mnt_file = os.path.join(DEST_REGISTRY_DIR, "mntner", "AKIRA-MNT")
    if os.path.exists(test_mnt_file):
        print("\n[Verification] Verified AKIRA-MNT:")
        with open(test_mnt_file, "r", encoding="utf-8") as f:
            print(f.read())

if __name__ == "__main__":
    sync()
