#!/usr/bin/env bash
# Weekly housekeeping on vm-app. Streamed over SSH by .github/workflows/ops-housekeeping.yml.
#
# Why: every deploy pulls a 2.3 to 3.4 GB application image and nothing ever removes the old ones. On
# 2026-11-07 vm-app held 34 GB of images, 19 GB of them unused, on an 83 GB disk. A full disk makes the
# next `docker pull` fail in the middle of a deploy.
#
# What it removes: images of OUR repositories only (ghcr.io/<owner>/quant-oci-*) that are older than
# QHK_MAX_AGE_DAYS (7), unless the tag is the one in .last-good-tag or .prev-tag (so a rollback does not
# need a re-pull). `docker image rm` without -f refuses an image that any container uses, so a running
# service can never lose its image. Third-party images (caddy, redis, postgres, pgvector, rclone) are left
# alone. No volume, container or network is touched.
#
# Output: sizes and counts only.

main() {
  set -Eeuo pipefail
  export LC_ALL=C
  local max_age_days="${QHK_MAX_AGE_DAYS:-7}"
  local state_dir="${QHK_STATE_DIR:-/opt/quant/oci}"
  [[ "$max_age_days" =~ ^[0-9]{1,3}$ ]] || { echo 'QHK_MAX_AGE_DAYS must be a whole number of days' >&2; exit 1; }
  command -v docker >/dev/null || { echo 'docker is not installed' >&2; exit 1; }
  docker ps >/dev/null 2>&1 || { echo 'docker is not usable by this user' >&2; exit 1; }

  section() { printf '\n## %s\n' "$1"; }
  usage() { df -hP / | awk 'NR==2{printf "root volume: %s used of %s (%s), %s free\n",$3,$2,$5,$4}'; docker system df; }

  section "disk before"
  usage

  local keep="" f
  for f in .last-good-tag .prev-tag; do
    [ -r "$state_dir/$f" ] && keep+="$(tr -d '[:space:]' <"$state_dir/$f") "
  done
  printf '\nprotected tags (rollback targets): %s\n' "${keep:-none found}"

  section "images"
  local now ref tag created age removed=0 recent=0 protected=0 busy=0 seen=0
  now=$(date +%s)
  while IFS='|' read -r ref _; do
    [ -n "$ref" ] || continue
    seen=$((seen + 1))
    tag="${ref##*:}"
    if [[ " $keep " == *" $tag "* ]]; then
      protected=$((protected + 1))
      continue
    fi
    created="$(docker image inspect -f '{{.Created}}' "$ref" 2>/dev/null || true)"
    age=$(( (now - $(date -d "${created:-now}" +%s 2>/dev/null || echo "$now")) / 86400 ))
    if [ "$age" -lt "$max_age_days" ]; then
      recent=$((recent + 1))
      continue
    fi
    if docker image rm "$ref" >/dev/null 2>&1; then
      removed=$((removed + 1))
      printf 'removed %s (%s days old)\n' "$ref" "$age"
    else
      busy=$((busy + 1))
      printf 'kept %s (%s days old, still used)\n' "$ref" "$age"
    fi
  done < <(docker image ls --format '{{.Repository}}:{{.Tag}}|{{.ID}}' | grep -E '^ghcr\.io/[^/]+/quant-oci-[^:]+:[^|]+\|' || true)
  docker image prune -f >/dev/null 2>&1 || true
  printf '\napplication images seen: %s | removed: %s | protected: %s | newer than %s days: %s | in use: %s\n' \
    "$seen" "$removed" "$protected" "$max_age_days" "$recent" "$busy"

  section "disk after"
  usage
}

main </dev/null
exit 0
