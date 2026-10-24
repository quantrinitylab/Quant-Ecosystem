#!/usr/bin/env bash
# T13 helper (run on the VM): one-line RAM / CPU / disk snapshot of the host and the lab containers.
#   ./resource-snapshot.sh            print once
#   ./resource-snapshot.sh 10 60      print every 10 s for 60 s (e.g. during load-test.mjs)
set -uo pipefail
interval="${1:-0}"
duration="${2:-0}"

snap() {
  echo "--- $(date -u +%FT%TZ)"
  free -m | awk 'NR==1 || /^Mem|^Swap/'
  echo "load: $(cut -d' ' -f1-3 /proc/loadavg)"
  df -h / | tail -n 1
  docker system df --format 'docker {{.Type}}: {{.Size}} ({{.Reclaimable}} reclaimable)' 2>/dev/null || true
  docker stats --no-stream --format '{{.Name}}: cpu {{.CPUPerc}} mem {{.MemUsage}}' 2>/dev/null || true
  docker run --rm -v quantmail-lab_stalwart-data:/d alpine du -sh /d 2>/dev/null | sed 's/^/stalwart-data: /' || true
}

snap
if [ "$interval" -gt 0 ] && [ "$duration" -gt 0 ]; then
  end=$(( $(date +%s) + duration ))
  while [ "$(date +%s)" -lt "$end" ]; do
    sleep "$interval"
    snap
  done
fi
