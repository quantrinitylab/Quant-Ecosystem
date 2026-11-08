#!/usr/bin/env bash
# Adds or updates allowlisted NAME=value pairs in /etc/quant/secrets.env on a VM.
#
#   QSYNC_INPUT=/path/to/pairs.txt [QSYNC_RESTART=none|backends|all] bash sync-secrets.sh
#
# Run by .github/workflows/ops-secrets-sync.yml over SSH. The pairs file holds one NAME=value per line,
# is created by the workflow with mode 0600 and is deleted by this script when it exits.
#
# Rules this script enforces, so a mistake in the workflow cannot become a leak or an injection:
#   * only names listed in RULE below are accepted, and each value must match that name's format
#   * values never appear in output; only the name, what happened and the value LENGTH are printed
#   * the existing file keeps its order, comments and every other line untouched
#   * a timestamped 0600 backup is written before any change, the newest five are kept
#   * the replacement keeps the mode, owner and group of the old file and is a same-directory rename,
#     so a reader never sees a half-written file
#   * nothing is ever deleted from the file (removal is a deliberate manual step)
#
# Environment (all optional except QSYNC_INPUT; the rest exist for tests):
#   QSYNC_ENV_FILE   target file (default /etc/quant/secrets.env)
#   QSYNC_SUDO       command prefix for privileged file access (default "sudo -n", empty in tests)
#   QSYNC_COMPOSE    compose file used by QSYNC_RESTART (default /opt/quant/oci/quant-stack.yml)
#   QSYNC_TMPDIR     scratch directory (default /var/tmp); QSYNC_TS fixes the backup timestamp
#   QSYNC_RESTART    none (default) | backends | all. Recreates containers so they re-read the file.

# Globals on purpose: the EXIT trap must still see them after main() has returned. As locals they would be
# unset by then, and `set -u` would turn a clean run into a failure.
work=""
input=""

main() {
  set -Eeuo pipefail
  umask 077
  export LC_ALL=C

  local env_file="${QSYNC_ENV_FILE:-/etc/quant/secrets.env}"
  local sudo_cmd="${QSYNC_SUDO-sudo -n}"
  local compose="${QSYNC_COMPOSE:-/opt/quant/oci/quant-stack.yml}"
  local restart="${QSYNC_RESTART:-none}"
  input="${QSYNC_INPUT:-}"

  die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
  cleanup() {
    local rc=$?
    [ -z "$work" ] || rm -rf -- "$work"
    if [ -n "$input" ] && [ -e "$input" ]; then
      if command -v shred >/dev/null 2>&1; then shred -u -- "$input" 2>/dev/null || rm -f -- "$input"; else rm -f -- "$input"; fi
    fi
    return $rc
  }
  trap cleanup EXIT

  [ -n "$input" ] || die 'QSYNC_INPUT is not set'
  [ -f "$input" ] || die 'the pairs file does not exist'
  case "$restart" in none | backends | all) ;; *) die 'QSYNC_RESTART must be none, backends or all' ;; esac

  # name -> regex for the value. Add a name here (in a reviewed change) before the workflow can send it.
  declare -A RULE=(
    [CLOUDFLARE_R2_ACCOUNT_ID]='^[a-f0-9]{32}$'
    [R2_ACCESS_KEY_ID]='^[A-Za-z0-9]{16,64}$'
    [R2_SECRET_ACCESS_KEY]='^[A-Za-z0-9]{32,128}$'
    [DRIVE_R2_BUCKET]='^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
    [ATTACHMENTS_BUCKET]='^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
    [BACKUP_S3_ENDPOINT]='^https://[a-z0-9][a-z0-9.-]{3,120}$'
    [BACKUP_S3_BUCKET]='^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
    [BACKUP_S3_REGION]='^[a-z0-9-]{3,30}$'
    [BACKUP_S3_FORCE_PATH_STYLE]='^(true|false)$'
    [BACKUP_S3_ACCESS_KEY_ID]='^[A-Za-z0-9]{16,64}$'
    [BACKUP_S3_SECRET_ACCESS_KEY]='^[A-Za-z0-9]{32,128}$'
    [BACKUP2_S3_ENDPOINT]='^https://[a-z0-9][a-z0-9.-]{3,120}$'
    [BACKUP2_S3_BUCKET]='^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
    [BACKUP2_S3_REGION]='^[a-z0-9-]{3,30}$'
    [BACKUP2_S3_FORCE_PATH_STYLE]='^(true|false)$'
    [BACKUP2_S3_ACCESS_KEY_ID]='^[A-Za-z0-9]{16,64}$'
    [BACKUP2_S3_SECRET_ACCESS_KEY]='^[A-Za-z0-9/+=]{32,128}$'
  )

  # ---------------------------------------------------------------- read and validate the pairs
  declare -A NEW=()
  local -a ORDER=()
  local line name val n=0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [ -n "$line" ] || continue
    n=$((n + 1))
    [[ "$line" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]] || die "line $n is not NAME=value"
    name="${BASH_REMATCH[1]}"
    val="${BASH_REMATCH[2]}"
    [ -n "${RULE[$name]+x}" ] || die "name not allowed: $name"
    [[ "$val" =~ ${RULE[$name]} ]] || die "the value for $name does not match its expected format (length ${#val})"
    [ -z "${NEW[$name]+x}" ] || die "name given twice: $name"
    NEW["$name"]="$val"
    ORDER+=("$name")
  done <"$input"
  [ "${#ORDER[@]}" -gt 0 ] || die 'the pairs file holds no pairs'
  printf 'pairs accepted: %s\n' "${#ORDER[@]}"

  # ---------------------------------------------------------------- build the new file
  work="$(mktemp -d "${QSYNC_TMPDIR:-/var/tmp}/qsync.XXXXXX")"
  local cur="$work/current" out="$work/new"
  $sudo_cmd cat -- "$env_file" >"$cur" || die "cannot read $env_file"

  declare -A SEEN=() HOW=()
  : >"$out"
  local key prefix old
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    prefix=""
    key=""
    if [[ "$line" =~ ^([[:space:]]*export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      prefix="${BASH_REMATCH[1]}"
      key="${BASH_REMATCH[2]}"
      old="${BASH_REMATCH[3]}"
    fi
    if [ -n "$key" ] && [ -n "${NEW[$key]+x}" ]; then
      if [ -n "${SEEN[$key]+x}" ]; then
        # A duplicate definition of the same key would silently win or lose depending on the reader. Drop it.
        HOW["$key"]="${HOW[$key]} (duplicate line removed)"
        continue
      fi
      SEEN["$key"]=1
      if [ "$old" = "${NEW[$key]}" ]; then HOW["$key"]="unchanged"; else HOW["$key"]="updated"; fi
      printf '%s%s=%s\n' "$prefix" "$key" "${NEW[$key]}" >>"$out"
    else
      printf '%s\n' "$line" >>"$out"
    fi
  done <"$cur"
  for name in "${ORDER[@]}"; do
    if [ -z "${SEEN[$name]+x}" ]; then
      printf '%s=%s\n' "$name" "${NEW[$name]}" >>"$out"
      HOW["$name"]="added"
    fi
  done

  printf '\nresult per name (values are never printed):\n'
  for name in "${ORDER[@]}"; do
    printf '  %-30s %s (value length %s)\n' "$name" "${HOW[$name]}" "${#NEW[$name]}"
  done

  # ---------------------------------------------------------------- write: backup, then atomic rename
  local changed=no
  for name in "${ORDER[@]}"; do case "${HOW[$name]}" in unchanged) ;; *) changed=yes ;; esac; done
  if [ "$changed" = yes ]; then
    local ts bak target
    local mode owner group
    ts="${QSYNC_TS:-$(date -u +%Y%m%dT%H%M%SZ)}"
    bak="${env_file}.bak-${ts}"
    target="${env_file}.new.$$"
    # The new file keeps the mode, owner and group of the old one (on the VM that is 640 root:opc, which the
    # backup job relies on). The backup copy is made stricter: 0600.
    mode="$($sudo_cmd stat -c %a -- "$env_file")"
    owner="$($sudo_cmd stat -c %U -- "$env_file")"
    group="$($sudo_cmd stat -c %G -- "$env_file")"
    $sudo_cmd cp -p -- "$env_file" "$bak"
    $sudo_cmd chmod 600 -- "$bak"
    if [ -n "$sudo_cmd" ]; then
      $sudo_cmd install -m "$mode" -o "$owner" -g "$group" -- "$out" "$target"
    else
      install -m "$mode" -- "$out" "$target" # tests run unprivileged: the file is already ours
    fi
    $sudo_cmd mv -f -- "$target" "$env_file"
    printf '\nwritten. backup kept as %s\n' "$(basename -- "$bak")"
    # keep the newest five backups
    local -a baks
    mapfile -t baks < <($sudo_cmd sh -c "ls -1t -- '${env_file}'.bak-* 2>/dev/null" || true)
    if [ "${#baks[@]}" -gt 5 ]; then
      local i
      for ((i = 5; i < ${#baks[@]}; i++)); do $sudo_cmd rm -f -- "${baks[$i]}"; done
      printf 'pruned %s old backup(s)\n' "$((${#baks[@]} - 5))"
    fi
  else
    printf '\nnothing to write, the file already has these values\n'
  fi
  printf 'file mode now: %s\n' "$($sudo_cmd stat -c '%a %U:%G' -- "$env_file")"

  # ---------------------------------------------------------------- optional restart
  if [ "$restart" != none ] && [ "$changed" = yes ]; then
    command -v docker >/dev/null || die 'docker is not installed'
    [ -f "$compose" ] || die "compose file not found: $compose"
    local -a svc
    case "$restart" in
      backends) svc=(quantmail-backend quantchat-backend quantai-backend) ;;
      all) svc=(quantmail-backend quantchat-backend quantai-backend quantmail-frontend quantchat quantai) ;;
    esac
    # Every service keeps the release it runs now. QuantMail, QuantChat and QuantAI are deployed separately and
    # usually run different tags, so the tag is read from each service's own container, never from a neighbour.
    # All tags are read first: if one service is not running nothing is recreated, instead of restarting half.
    local s cid tag
    local -A TAG=()
    for s in "${svc[@]}"; do
      cid="$(docker ps -q --filter "label=com.docker.compose.service=$s" | head -n1)"
      [ -n "$cid" ] || die "service $s is not running, refusing to guess its image tag"
      tag="$(docker inspect --format '{{.Config.Image}}' "$cid" | sed 's/^.*://')"
      [[ "$tag" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || die "could not read a usable image tag for $s"
      TAG["$s"]="$tag"
    done
    printf '\n'
    for s in "${svc[@]}"; do
      printf 'recreating %s (image tag %s)\n' "$s" "${TAG[$s]:0:12}"
      IMAGE_TAG="${TAG[$s]}" docker compose -f "$compose" up -d --no-deps --force-recreate "$s" 2>&1 | sed 's/^/  /'
    done
    sleep "${QSYNC_SETTLE_SECONDS:-8}"
    docker ps --format '  {{.Names}} | {{.Status}}' | sort
  elif [ "$restart" != none ]; then
    printf '\nno restart needed, nothing changed\n'
  fi

  printf '\nSYNC_OK pairs=%s changed=%s\n' "${#ORDER[@]}" "$changed"
}

main </dev/null
exit 0
