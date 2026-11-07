#!/usr/bin/env bash
# Read-only diagnostics for vm-app (Oracle Cloud). Streamed over SSH by
# .github/workflows/ops-diagnose.yml:
#
#   ssh user@vm-app 'bash -s' < infra/oci/ops/diagnose-vm-app.sh
#
# Why this exists: the owner has no shell on the VM, and the questions that
# decide the next steps (can the VM send mail, which mail and storage settings
# exist, is the queue stuck, what is in the database, is anything backed up)
# can only be answered from inside it.
#
# Rules, because the Actions log of this repository is PUBLIC:
#   * Print names, counts, dates and yes/no flags. Never print a secret value,
#     a connection string, an e-mail address or a user IP address.
#   * Change nothing: no restart, no write, no package install. The database
#     session is read-only at the server (default_transaction_read_only).
#   * The whole body lives in main() and runs with stdin from /dev/null, so no
#     command inside it can swallow the rest of this script from the SSH pipe.
#
# Optional environment: VM_APP_IP, REPO_COMPOSE_SHA256, WITH_DB (true|false),
# QUANT_SECRETS_FILE (tests only; defaults to /etc/quant/secrets.env).

main() {
  set +e +x
  export LC_ALL=C

  section() { printf '\n## %s\n' "$1"; }
  have() { command -v "$1" >/dev/null 2>&1; }

  # Read a root-only file: directly first, then through passwordless sudo.
  readf() { cat -- "$1" 2>/dev/null || sudo -n cat -- "$1" 2>/dev/null; }

  # Mask anything that could identify a person or carry a credential. Used on
  # log messages and database error text, never on values we choose to print.
  mask() {
    sed -E \
      -e 's#[A-Za-z][A-Za-z0-9+.-]*://[^[:space:]]+#<url>#g' \
      -e 's#[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}#<email>#g' \
      -e 's#[0-9]{1,3}(\.[0-9]{1,3}){3}#<ip>#g' \
      -e 's#[A-Za-z0-9_-]{24,}#<id>#g'
  }

  sudo_ok=no
  sudo -n true 2>/dev/null && sudo_ok=yes

  # Docker: prefer plain `docker` (the deploy user is in the docker group).
  DK=""
  DOCKER_SUDO=no
  if have docker; then
    if docker ps >/dev/null 2>&1; then
      DK="docker"
    elif sudo -n docker ps >/dev/null 2>&1; then
      DK="sudo -n docker"
      DOCKER_SUDO=yes
    fi
  fi
  # Newest container (any state) of a compose service, found by label so the
  # compose project name does not matter.
  cid_of() {
    [ -n "$DK" ] || return 0
    $DK ps -aq --filter "label=com.docker.compose.service=$1" 2>/dev/null | head -n1
  }

  # ---------------------------------------------------------------- host --
  section "host"
  printf 'utc_now: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'uptime: %s | load: %s\n' "$(uptime -p 2>/dev/null)" "$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)"
  printf 'os: %s | kernel: %s | arch: %s | cpus: %s\n' \
    "$(. /etc/os-release 2>/dev/null; echo "${PRETTY_NAME:-unknown}")" "$(uname -r)" "$(uname -m)" "$(nproc 2>/dev/null)"
  free -m 2>/dev/null | awk '/^Mem:/{printf "mem_mb: total=%s used=%s available=%s\n",$2,$3,$7} /^Swap:/{printf "swap_mb: total=%s used=%s\n",$2,$3}'
  df -hP / /var/lib/docker /opt 2>/dev/null | awk '!seen[$1" "$6]++'
  printf 'passwordless_sudo: %s | docker_access: %s\n' "$sudo_ok" "${DK:-none}"

  section "oracle instance metadata (IMDS)"
  meta="$(curl -s -m 4 -H 'Authorization: Bearer Oracle' http://169.254.169.254/opc/v2/instance/ 2>/dev/null | tr -d '\n')"
  if [ -n "$meta" ]; then
    jstr() { printf '%s' "$meta" | grep -o "\"$1\" *: *\"[^\"]*\"" | head -n1 | sed 's/^[^:]*: *"\(.*\)"$/\1/'; }
    jnum() { printf '%s' "$meta" | grep -o "\"$1\" *: *[0-9.]*" | head -n1 | sed 's/^[^:]*: *//'; }
    printf 'shape: %s | region: %s | name: %s\n' "$(jstr shape)" "$(jstr canonicalRegionName)" "$(jstr displayName)"
    printf 'ocpus: %s | memory_gb: %s\n' "$(jnum ocpus)" "$(jnum memoryInGBs)"
    created_ms="$(jnum timeCreated)"
    case "$created_ms" in
      ''|*[!0-9]*) ;;
      *) printf 'instance_created_utc: %s\n' "$(date -u -d "@$((created_ms / 1000))" +%Y-%m-%d 2>/dev/null)" ;;
    esac
  else
    echo "IMDS not reachable"
  fi

  # -------------------------------------------------------------- docker --
  section "docker"
  if [ -z "$DK" ]; then
    echo "docker is not usable by $(id -un)"
  else
    $DK --version 2>&1 | head -n1
    printf 'compose: %s\n' "$($DK compose version --short 2>&1 | head -n1)"
    $DK compose ls 2>&1 | head -n5
    $DK ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' 2>&1
    timeout 25 $DK stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.PIDs}}' 2>&1
    for id in $($DK ps -aq 2>/dev/null); do
      $DK inspect -f '{{.Name}} restarts={{.RestartCount}} oom_killed={{.State.OOMKilled}} exit_code={{.State.ExitCode}} started={{.State.StartedAt}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>&1
    done
    $DK system df 2>&1
  fi

  section "docker disk hygiene"
  if [ -n "$DK" ]; then
    $DK info --format 'logging_driver={{.LoggingDriver}} storage_driver={{.Driver}} root={{.DockerRootDir}}' 2>&1 | head -n1
    echo "-- /etc/docker/daemon.json"
    readf /etc/docker/daemon.json | head -n 20
    echo "-- images (repository, tag, size, age)"
    $DK images --format '  {{.Repository}}:{{.Tag}}  {{.Size}}  {{.CreatedSince}}' 2>&1 | head -n 40
    echo "-- largest container log files (no rotation fills the disk)"
    sudo -n find /var/lib/docker/containers -maxdepth 2 -name '*-json.log' -printf '%s %f\n' 2>/dev/null \
      | sort -rn | head -n 8 | awk '{ printf "  %.1f MB  %s\n", $1 / 1048576, substr($2, 1, 12) }'
  else
    echo "skipped (no docker access)"
  fi

  section "patching and time"
  printf 'ntp_synchronized: %s\n' "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)"
  printf 'running kernel: %s | newest installed kernel: %s\n' "$(uname -r)" "$(rpm -q kernel-uek --last 2>/dev/null | head -n1 | cut -d' ' -f1)"
  printf 'pending security advisories: %s\n' "$(timeout 60 sudo -n dnf -q updateinfo list security 2>/dev/null | grep -c .)"

  section "deploy state (/opt/quant/oci)"
  ls -la --time-style=long-iso /opt/quant/oci 2>&1 | head -n 20
  printf 'last-good-tag: %s\n' "$(readf /opt/quant/oci/.last-good-tag)"
  printf 'prev-tag:      %s\n' "$(readf /opt/quant/oci/.prev-tag)"
  if [ -r /opt/quant/oci/quant-stack.yml ]; then
    vm_sha="$(sha256sum < /opt/quant/oci/quant-stack.yml | cut -d' ' -f1)"
  else
    vm_sha="unreadable-or-missing"
  fi
  printf 'compose_sha256_on_vm:   %s\n' "$vm_sha"
  printf 'compose_sha256_in_repo: %s\n' "${REPO_COMPOSE_SHA256:-unknown}"
  if [ "$vm_sha" = "${REPO_COMPOSE_SHA256:-}" ]; then
    echo "compose_matches_repo_main: yes"
  else
    echo "compose_matches_repo_main: NO (the VM runs a compose file from an older release, or it is unreadable)"
  fi

  # --------------------------------------------------------------- redis --
  section "redis (queue backing store)"
  rid="$(cid_of quant-redis)"
  if [ -z "$rid" ]; then
    echo "redis container not found"
  else
    RC="$DK exec $rid redis-cli"
    $RC INFO server 2>&1 | tr -d '\r' | grep -E '^(redis_version|uptime_in_seconds):'
    $RC INFO keyspace 2>&1 | tr -d '\r' | grep -v '^#'
    $RC INFO persistence 2>&1 | tr -d '\r' | grep -E '^(loading|aof_enabled|aof_last_write_status|rdb_last_save_time|rdb_last_bgsave_status):'
    printf 'redis data dir: %s\n' "$($RC CONFIG GET dir 2>&1 | tr -d '\r' | tail -n1)"
    # An empty list here means queued mail does not survive `compose down`.
    $DK inspect -f 'mounts: {{len .Mounts}} {{range .Mounts}}[{{.Type}} {{.Destination}}] {{end}}' "$rid" 2>&1
    qcount() {
      local t
      t="$($RC TYPE "$1" 2>/dev/null | tr -d '\r')"
      case "$t" in
        list) $RC LLEN "$1" 2>/dev/null | tr -d '\r' ;;
        zset) $RC ZCARD "$1" 2>/dev/null | tr -d '\r' ;;
        none) echo 0 ;;
        *) echo "type=$t" ;;
      esac
    }
    qnames="$($RC --scan --pattern 'bull:*:meta' 2>/dev/null | tr -d '\r' | sed 's/^bull://; s/:meta$//' | sort | head -n 20)"
    if [ -z "$qnames" ]; then
      echo "no BullMQ queue keys (no queue was ever created, or Redis was reset)"
    else
      for q in $qnames; do
        printf 'queue %-28s wait=%s active=%s delayed=%s failed=%s completed=%s\n' "$q" \
          "$(qcount "bull:$q:wait")" "$(qcount "bull:$q:active")" "$(qcount "bull:$q:delayed")" \
          "$(qcount "bull:$q:failed")" "$(qcount "bull:$q:completed")"
      done
    fi
  fi

  # ------------------------------------------------------------- network --
  section "listening ports and firewall"
  printf 'listening tcp ports: %s\n' "$(ss -ltnH 2>/dev/null | awk '{n=split($4,a,":"); print a[n]}' | sort -n | uniq | tr '\n' ' ')"
  echo "-- port and owning process"
  sudo -n ss -ltnpH 2>/dev/null | awk '{
    n = split($4, a, ":"); port = a[n]; proc = "?"
    if (match($0, /users:\(\("[^"]+"/)) proc = substr($0, RSTART + 9, RLENGTH - 10)
    print "  " port " " proc }' | sort -n | uniq
  if systemctl is-active --quiet firewalld 2>/dev/null; then
    echo "firewalld: active"
    sudo -n firewall-cmd --list-all 2>/dev/null | grep -E '^[[:space:]]*(services|ports|sources):'
  else
    echo "firewalld: inactive or absent"
  fi
  sudo -n iptables -S INPUT 2>/dev/null | head -n 15

  section "ssh daemon, effective settings (no keys)"
  sudo -n sshd -T 2>/dev/null | grep -E '^(port|permitrootlogin|passwordauthentication|pubkeyauthentication|kbdinteractiveauthentication|maxauthtries|allowusers|allowgroups) '
  printf 'ssh failed-auth lines, last 24h: %s\n' \
    "$(sudo -n journalctl -u sshd --since '24 hours ago' --no-pager 2>/dev/null | grep -Ec 'Failed password|Invalid user|authentication failure')"

  section "outbound reachability from vm-app"
  # Oracle blocks outbound TCP 25 on tenancies created after 2021-06-23 unless
  # an exemption was granted. TIMEOUT on port 25 with CONNECTED on 587/465 is
  # the signature of that block.
  tcp_probe() {
    local host="$1" port="$2" label="$3" out rc t0 t1 res
    t0=$(date +%s%N)
    out="$(timeout 8 bash -c 'exec 3<>"/dev/tcp/$0/$1" || exit 3; IFS= read -r -t 5 -u 3 l; printf "%s" "${l:0:3}"' "$host" "$port" 2>/dev/null)"
    rc=$?
    t1=$(date +%s%N)
    case "$rc" in
      0) res="CONNECTED banner=${out:-none}" ;;
      124) res="TIMEOUT (packets dropped)" ;;
      1|3) res="FAILED (refused, unreachable or DNS)" ;;
      *) res="error rc=$rc" ;;
    esac
    printf '%-11s %-42s %-5s %s (%d ms)\n' "$label" "$host" "$port" "$res" $(((t1 - t0) / 1000000))
  }
  tcp_probe gmail-smtp-in.l.google.com 25 "mx-google"
  tcp_probe outlook-com.olc.protection.outlook.com 25 "mx-outlook"
  tcp_probe smtp.gmail.com 587 "submission"
  tcp_probe smtp.gmail.com 465 "smtps"
  tcp_probe 1.1.1.1 443 "https"
  printf 'dns gmail-smtp-in: %s\n' "$(getent hosts gmail-smtp-in.l.google.com 2>/dev/null | head -n1 | cut -d' ' -f1)"
  if [ -n "${VM_APP_IP:-}" ]; then
    printf 'reverse dns of public ip (PTR): %s\n' "$(getent hosts "$VM_APP_IP" 2>/dev/null | awk '{print $2; exit}' | grep . || echo none)"
  fi
  printf 'egress as seen by cloudflare: %s\n' \
    "$(curl -s -m 6 https://1.1.1.1/cdn-cgi/trace 2>/dev/null | grep -E '^(ip|loc)=' | tr '\n' ' ')"

  # ------------------------------------------------- configuration names --
  section "mail and storage configuration (names and set/empty flags only; values are never printed)"
  secrets_file="${QUANT_SECRETS_FILE:-/etc/quant/secrets.env}"
  declare -A ENVV=()
  env_ok=no
  if readf "$secrets_file" >/dev/null 2>&1; then
    env_ok=yes
    while IFS= read -r line || [ -n "$line" ]; do
      line="${line%$'\r'}"
      case "$line" in '' | '#'*) continue ;; esac
      line="${line#export }"
      [[ "$line" == *=* ]] || continue
      key="${line%%=*}"
      [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
      ENVV["$key"]="${line#*=}"
    done < <(readf "$secrets_file")
  fi

  if [ "$env_ok" != yes ]; then
    echo "$secrets_file is not readable by $(id -un) (and no passwordless sudo)"
  else
    stat -c 'file: %n mode=%a owner=%U:%G bytes=%s modified=%y' "$secrets_file" 2>/dev/null | cut -c1-140
    printf 'variables defined: %s\n' "${#ENVV[@]}"
    printf 'names: %s\n' "$(printf '%s\n' "${!ENVV[@]}" | sort | tr '\n' ' ')"

    is_placeholder() {
      case "$(printf '%s' "$1" | tr 'A-Z' 'a-z')" in
        *change* | *replace* | *example* | *your[-_]* | *todo* | *xxx* | *placeholder* | *dummy* | *"<"*">"* | test | secret | password) return 0 ;;
      esac
      return 1
    }
    describe() {
      local k="$1" v
      if [ -z "${ENVV[$k]+x}" ]; then
        echo absent
        return
      fi
      v="${ENVV[$k]}"
      v="${v#\"}"; v="${v%\"}"; v="${v#\'}"; v="${v%\'}"
      if [ -z "$v" ]; then
        echo "EMPTY"
      elif is_placeholder "$v"; then
        echo "set (looks like a placeholder)"
      else
        echo "set"
      fi
    }

    echo "-- presence of the variables the mail and storage code reads"
    listed=" "
    for k in AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY SES_REGION SES_ACCESS_KEY_ID SES_SECRET_ACCESS_KEY \
      SES_CONFIGURATION_SET INBOUND_S3_BUCKET INBOUND_S3_BUCKETS INBOUND_SNS_TOPIC_ARNS INBOUND_WEBHOOK_ALLOW_UNSIGNED \
      INBOUND_WEBHOOK_TEST_UNSIGNED MAIL_SENDER_DOMAIN SMTP_HELO_NAME SMTP_HOST DELIVERY_WORKER_CONCURRENCY \
      VERIFICATION_EMAIL_FROM PASSWORD_RESET_FROM VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT \
      CLOUDFLARE_R2_ENDPOINT R2_ENDPOINT S3_ENDPOINT CLOUDFLARE_R2_ACCOUNT_ID R2_ACCESS_KEY_ID S3_ACCESS_KEY \
      R2_SECRET_ACCESS_KEY S3_SECRET_KEY ATTACHMENTS_BUCKET R2_BUCKET S3_BUCKET S3_REGION S3_FORCE_PATH_STYLE \
      DRIVE_MASTER_KEY DATABASE_URL; do
      printf '  %-34s %s\n' "$k" "$(describe "$k")"
      listed="$listed$k "
    done
    echo "-- other variables with a mail, storage or cloud prefix"
    for k in $(printf '%s\n' "${!ENVV[@]}" | sort); do
      case "$k" in
        DRIVE_* | R2_* | S3_* | CLOUDFLARE_* | SES_* | AWS_* | OCI_* | INBOUND_* | SMTP_* | MAIL_* | IMAP_* | JMAP_* | STALWART_*)
          case "$listed" in *" $k "*) ;; *) printf '  %-34s %s\n' "$k" "$(describe "$k")" ;; esac
          ;;
      esac
    done

    echo "-- plain values of settings that are not secret"
    for k in NODE_ENV AWS_REGION SES_REGION S3_REGION DRIVE_S3_REGION S3_FORCE_PATH_STYLE DRIVE_S3_FORCE_PATH_STYLE \
      MAIL_SENDER_DOMAIN SMTP_HELO_NAME DELIVERY_WORKER_CONCURRENCY INBOUND_WEBHOOK_ALLOW_UNSIGNED \
      INBOUND_WEBHOOK_TEST_UNSIGNED SES_CONFIGURATION_SET AI_PROVIDER; do
      [ -n "${ENVV[$k]+x}" ] && printf '  %s=%s\n' "$k" "${ENVV[$k]:0:60}"
    done
    echo "-- bucket names"
    for k in INBOUND_S3_BUCKET INBOUND_S3_BUCKETS ATTACHMENTS_BUCKET R2_BUCKET S3_BUCKET DRIVE_S3_BUCKET DRIVE_R2_BUCKET; do
      v="${ENVV[$k]-}"
      [ -n "$v" ] || continue
      if [[ "$v" =~ ^[a-z0-9][a-z0-9.,_-]{1,200}$ ]]; then
        printf '  %s=%s\n' "$k" "$v"
      else
        printf '  %s=<unexpected format>\n' "$k"
      fi
    done
    echo "-- which provider each endpoint variable points to"
    endpoint_kind() {
      case "$1" in
        *r2.cloudflarestorage.com*) echo "Cloudflare R2" ;;
        *oraclecloud.com*) echo "Oracle Object Storage" ;;
        *amazonaws.com*) echo "AWS" ;;
        '') echo "empty" ;;
        *) echo "other" ;;
      esac
    }
    for k in $(printf '%s\n' "${!ENVV[@]}" | sort); do
      case "$k" in *ENDPOINT*) printf '  %-34s %s\n' "$k" "$(endpoint_kind "${ENVV[$k]}")" ;; esac
    done
    if [ -n "${ENVV[DATABASE_URL]+x}" ]; then
      printf 'DATABASE_URL points at: %s\n' \
        "$(printf '%s' "${ENVV[DATABASE_URL]}" | sed -E 's#^[A-Za-z]+://[^@]*@([^/:?]+)(:([0-9]+))?/([^?]*).*#host=\1 port=\3 database=\4#')"
    fi

    # Variables in the file but missing from the running container mean the
    # file was edited after the container was created (needs a recreate).
    bid="$(cid_of quantmail-backend)"
    if [ -n "$bid" ]; then
      echo "-- in /etc/quant/secrets.env but NOT in the running quantmail-backend container:"
      comm -23 <(printf '%s\n' "${!ENVV[@]}" | sort -u) \
        <($DK inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$bid" 2>/dev/null | sed 's/=.*//' | sort -u) | tr '\n' ' '
      echo
    fi
  fi
  [ -n "${bid:-}" ] || bid="$(cid_of quantmail-backend)"

  section "other files under /etc/quant (names only)"
  printf '%s\n' "$(ls -1 /etc/quant 2>/dev/null | tr '\n' ' ')"

  section "reverse proxy and origin certificate"
  readf /etc/quant/caddy/Caddyfile | grep -E '^[^#[:space:]].*\{[[:space:]]*$|reverse_proxy|^[[:space:]]*tls ' | sed 's/[[:space:]]\+/ /g' | head -n 40
  if have openssl; then
    readf /etc/quant/certs/origin.pem | openssl x509 -noout -enddate -subject -ext subjectAltName 2>/dev/null
  fi

  section "scheduled jobs on vm-app (counts and unit names only)"
  printf 'crontab lines (this user): %s\n' "$(crontab -l 2>/dev/null | grep -Evc '^[[:space:]]*(#|$)')"
  printf 'crontab lines (root): %s\n' "$(sudo -n crontab -l 2>/dev/null | grep -Evc '^[[:space:]]*(#|$)')"
  printf '/etc/cron.d: %s\n' "$(ls /etc/cron.d 2>/dev/null | tr '\n' ' ')"
  systemctl list-timers --all --no-pager --no-legend 2>/dev/null | awk '{print "  timer: " $(NF-1)}'
  printf '/opt: %s\n' "$(ls -1 /opt 2>/dev/null | tr '\n' ' ')"
  printf 'journal errors, last 24h: %s | kernel OOM lines: %s\n' \
    "$(sudo -n journalctl -p err --since '24 hours ago' --no-pager 2>/dev/null | wc -l)" \
    "$(sudo -n dmesg 2>/dev/null | grep -ci 'out of memory')"

  # ---------------------------------------------------------------- logs --
  section "container log counters, last 24h (counts only)"
  if [ -z "$DK" ]; then
    echo "skipped (no docker access)"
  else
    for svc in quantmail-frontend quantmail-backend quantchat quantchat-backend quantai quantai-backend quant-proxy; do
      cid="$(cid_of "$svc")"
      [ -n "$cid" ] || { printf '  %-20s container not found\n' "$svc"; continue; }
      printf '  %-20s error-ish lines: %s\n' "$svc" \
        "$(timeout 40 $DK logs --since 24h "$cid" 2>&1 | grep -ciE '"level":(50|60)|level=error|\[error\]|error:')"
    done
    if [ -n "$bid" ]; then
      echo "-- quantmail-backend markers"
      timeout 40 $DK logs --since 24h "$bid" 2>&1 | awk '
        { n++; l = tolower($0) }
        l ~ /"level":(50|60)|level=error|\[error\]/ { err++ }
        l ~ /sendviases|sesv2|amazonaws|ses delivery|aws ses/ { ses++ }
        l ~ /econnrefused|etimedout|enotfound|eai_again|econnreset/ { net++ }
        l ~ /deferred/ { def++ }
        l ~ /webhook\/inbound/ { inb++ }
        l ~ /password.?reset|reset.?password/ { pwr++ }
        l ~ /unhandled|uncaught|fatal/ { crash++ }
        l ~ /outbound|delivery/ { del++ }
        END {
          printf "  lines=%d error_level=%d ses_or_aws=%d network_errors=%d deferred=%d inbound_webhook=%d password_reset=%d unhandled_or_fatal=%d delivery=%d\n",
            n, err, ses, net, def, inb, pwr, crash, del
        }'
      echo "-- most frequent error messages (emails, ips, ids masked)"
      timeout 40 $DK logs --since 24h "$bid" 2>&1 \
        | grep -iE '"level":(50|60)|error' \
        | sed -E 's/.*"msg":"([^"]*)".*/\1/' | cut -c1-110 | mask \
        | sort | uniq -c | sort -rn | head -n 10
    fi
  fi

  # ------------------------------------------------------------ database --
  section "database aggregates (read-only session; counts and dates only)"
  if [ "${WITH_DB:-true}" != "true" ]; then
    echo "skipped (include_db_counts is off)"
  elif [ -z "$DK" ] || [ "$DOCKER_SUDO" = yes ]; then
    echo "skipped (needs docker without sudo, so the connection string never appears in a process list)"
  elif [ "$env_ok" != yes ] || [ -z "${ENVV[DATABASE_URL]+x}" ]; then
    echo "skipped (DATABASE_URL not readable)"
  else
    dburl="${ENVV[DATABASE_URL]}"
    dburl="${dburl#\"}"; dburl="${dburl%\"}"; dburl="${dburl#\'}"; dburl="${dburl%\'}"
    # Prisma-only query parameters (schema, connection_limit, ...) make libpq
    # reject the URL; keep sslmode and add a connect timeout.
    dbbase="${dburl%%\?*}"
    dbparams=""
    if [[ "$dburl" == *\?* ]]; then
      IFS='&' read -r -a kv <<<"${dburl#*\?}"
      for p in "${kv[@]}"; do
        case "$p" in sslmode=*) dbparams="${dbparams:+$dbparams&}$p" ;; esac
      done
    fi
    export PGURL="$dbbase?${dbparams:+$dbparams&}connect_timeout=8"
    export PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=10000'
    docker image inspect postgres:16-alpine >/dev/null 2>&1 || timeout 120 docker pull -q postgres:16-alpine >/dev/null 2>&1
    timeout 90 docker run --rm -i -e PGURL -e PGOPTIONS postgres:16-alpine \
      sh -c 'psql "$PGURL" -X -q -P pager=off -P footer=off -P null=- -f -' 2>&1 <<'SQL' | mask_db
\echo '-- users'
SELECT count(*) AS users_total,
       count(*) FILTER (WHERE "createdAt" > now() - interval '7 days')  AS signups_7d,
       count(*) FILTER (WHERE "createdAt" > now() - interval '30 days') AS signups_30d,
       min("createdAt")::date AS first_signup,
       max("createdAt")::date AS last_signup
FROM users;

\echo '-- emails by delivery status, all time'
SELECT "deliveryStatus"::text AS status, count(*) AS n FROM emails GROUP BY 1 ORDER BY 2 DESC;

\echo '-- mail per day, last 14 days'
SELECT "createdAt"::date AS day,
       count(*) FILTER (WHERE "isSent") AS sent,
       count(*) FILTER (WHERE NOT "isSent" AND NOT "isDraft") AS received,
       count(*) FILTER (WHERE "isDraft") AS drafts
FROM emails WHERE "createdAt" > now() - interval '14 days' GROUP BY 1 ORDER BY 1 DESC;

\echo '-- mail that arrived from outside (authResults recorded), per week'
SELECT date_trunc('week', "createdAt")::date AS week, count(*) AS external_inbound
FROM emails WHERE "authResults" IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 10;

\echo '-- newest external inbound mail and newest delivery attempt'
SELECT (SELECT max("createdAt") FROM emails WHERE "authResults" IS NOT NULL) AS newest_external_inbound,
       (SELECT max("attemptedAt") FROM delivery_attempts) AS newest_delivery_attempt;

\echo '-- delivery_attempts by status'
SELECT status::text AS status, count(*) AS n, min("attemptedAt")::date AS first_seen, max("attemptedAt")::date AS last_seen
FROM delivery_attempts GROUP BY 1 ORDER BY 2 DESC;

\echo '-- why attempts were deferred or bounced (emails masked)'
SELECT status::text AS status,
       left(regexp_replace(coalesce("smtpResponse", ''), '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+', '<email>', 'g'), 90) AS reason,
       count(*) AS n
FROM delivery_attempts WHERE status::text IN ('deferred', 'bounced') GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15;

\echo '-- deferred attempts whose nextRetryAt passed over an hour ago (nothing retries them)'
SELECT count(*) AS stuck_deferred FROM delivery_attempts WHERE status::text = 'deferred' AND "nextRetryAt" < now() - interval '1 hour';

\echo '-- sent mail still queued after an hour'
SELECT count(*) AS stuck_queued FROM emails WHERE "deliveryStatus"::text = 'queued' AND "sentAt" < now() - interval '1 hour';

\echo '-- refresh tokens: how many are dead weight'
SELECT count(*) AS total,
       count(*) FILTER (WHERE "expiresAt" < now()) AS expired,
       count(*) FILTER (WHERE "isRevoked") AS revoked,
       count(DISTINCT family) AS families,
       count(DISTINCT "userId") AS users
FROM refresh_tokens;

\echo '-- suppressions, dkim keys, attachments'
SELECT (SELECT count(*) FROM email_suppressions) AS suppressions,
       (SELECT count(*) FROM domain_auth_keys)   AS dkim_keys,
       (SELECT count(*) FROM mail_attachments)   AS attachments;

\echo '-- migrations'
SELECT count(*) AS applied, max(finished_at)::date AS newest_applied FROM _prisma_migrations WHERE finished_at IS NOT NULL;
SELECT migration_name AS newest_migrations FROM _prisma_migrations ORDER BY started_at DESC LIMIT 3;

\echo '-- server'
SELECT current_setting('server_version') AS pg_version,
       pg_size_pretty(pg_database_size(current_database())) AS db_size,
       current_setting('max_connections') AS max_connections,
       (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS open_connections;
SELECT extname AS extensions FROM pg_extension ORDER BY 1;

\echo '-- uptime and activity of this database'
SELECT pg_postmaster_start_time()::date AS server_up_since,
       pg_is_in_recovery() AS is_replica,
       (SELECT xact_commit FROM pg_stat_database WHERE datname = current_database()) AS commits,
       (SELECT xact_rollback FROM pg_stat_database WHERE datname = current_database()) AS rollbacks,
       (SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()) AS deadlocks;

\echo '-- biggest tables by live rows'
SELECT relname, n_live_tup AS approx_rows FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 15;

\echo '-- backup signals (WAL archiving, replicas)'
SELECT current_setting('archive_mode') AS archive_mode;
SELECT CASE WHEN current_setting('archive_command') IN ('', '(disabled)') THEN 'unset'
            ELSE split_part(current_setting('archive_command'), ' ', 1) END AS archive_command_program;
SELECT archived_count, failed_count, last_archived_time FROM pg_stat_archiver;
SELECT count(*) AS replicas FROM pg_stat_replication;
SQL
    unset PGURL PGOPTIONS
  fi

  section "done"
  echo "ok"
}

# Database error text can echo a host or user; run it through the same mask.
mask_db() {
  sed -E \
    -e 's#[A-Za-z][A-Za-z0-9+.-]*://[^[:space:]]+#<url>#g' \
    -e 's#[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}#<email>#g' \
    -e 's#password[^,;]*#password <hidden>#Ig'
}

main </dev/null
exit 0
