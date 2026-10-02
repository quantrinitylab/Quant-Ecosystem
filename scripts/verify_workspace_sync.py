import os
import hashlib
import sys

def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    dir1 = r"C:\Users\Pc\Quant-Ecosystem\flutter_apps"
    dir2 = r"C:\Users\Pc\Quant-Ecosystem-latest\flutter_apps"

    mismatches = []
    total = 0

    for root, dirs, files in os.walk(dir1):
        for f in files:
            p1 = os.path.join(root, f)
            rel = os.path.relpath(p1, dir1)
            p2 = os.path.join(dir2, rel)
            total += 1

            if not os.path.exists(p2):
                mismatches.append((rel, "Missing in latest"))
            else:
                h1 = sha256(p1)
                h2 = sha256(p2)
                if h1 != h2:
                    mismatches.append((rel, f"Hash mismatch: {h1[:8]} vs {h2[:8]}"))

    print(f"Total files verified in flutter_apps: {total}")
    print(f"Total mismatches: {len(mismatches)}")
    if mismatches:
        for rel, reason in mismatches:
            print(f"  FAILED: {rel} -> {reason}")
        sys.exit(1)
    else:
        print("SUCCESS: 100% byte-for-byte parity across both workspaces!")

if __name__ == "__main__":
    main()
