#!/bin/bash
set -euo pipefail

# Health Check Script
# Validates all Quant platform services are responding.
#
# Usage: ./health-check.sh [--base-url <url>]
#
# Options:
#   --base-url   Base URL for service endpoints (default: http://localhost)

BASE_URL="${BASE_URL:-http://localhost}"
TIMEOUT=5
FAILED=0
TOTAL=0

# Service definitions: name:port:path
#
# THE PATH IS PART OF THE DEFINITION BECAUSE IT IS NOT THE SAME EVERYWHERE, AND
# EVERY ROW HERE IS A SERVICE THAT ACTUALLY EXISTS AND ACTUALLY LISTENS.
#
# This table used to hold eleven rows — identity, chat-api, mail-api, ai-api,
# sync-api, ads-api, tube-api, neon-api, edits-api, max-api, ws-gateway — all
# polled at `/health` on ports 3001-3009. Two independent problems, and either
# one alone was enough to make the script useless:
#
#   1. No Quant service has ever served `/health`. `packages/server-core/src/
#      plugins/health.ts` registers `/healthz`, `/livez` and `/readyz`, and
#      `/health` appears only in that file's prefix-matched public-path
#      allowlist. The Next.js apps serve `/api/health`, because Next mounts
#      app-router handlers under `/api`.
#   2. Ten of the eleven names are not deployable services. `apps/quantads`,
#      `quantube`, `quantneon`, `quantedits`, `quantmax`, `quantsync` and friends
#      have a `backend/app.ts` that builds a Fastify instance and no `server.ts`
#      that ever calls `listen`, no Dockerfile, no compose entry and no chart
#      entry. Nothing was listening on 3001-3009 to answer anything.
#
# So this script reported the entire platform DOWN regardless of its actual
# state, and the cutover runbook's health gate was worthless. A check that always
# fails teaches you to ignore it, which is the same failure mode as a check that
# always passes.
#
# Ports and paths below are each traceable to one file:
#   quantmail          apps/quantmail/Dockerfile          ENV PORT=3010, next start
#   quantmail-backend  apps/quantmail/Dockerfile.backend  ENV PORT=3011, Fastify
#   quantchat          apps/quantchat/Dockerfile          ENV PORT=3015, next start
#   quantai            apps/quantai/Dockerfile            ENV PORT=3020, next start
#   admin              apps/admin/Dockerfile              ENV PORT=3100, next start
#   ws-gateway         services/ws-gateway/src/main.ts    ws port 8080
#   meilisearch        docker-compose.yml                 7700
#
# ws-gateway is the one row that keeps `/health`: it is not a server-core app.
# Its WebSocket server attaches a plain `createServer` handler answering `/health`
# and `/api/health` on 8080, while `@quant/health-server` serves `/healthz` on a
# separate HEALTH_PORT (3040) that neither compose nor the chart publishes — so
# 3040 is deliberately not a row here. meilisearch's `/health` is its own
# upstream route and is correct as written.
#
# WHAT THIS SCRIPT CANNOT CHECK: an ingress deployment. Every row is polled as
# `BASE_URL:PORT`, which is docker-compose on localhost or a `kubectl
# port-forward`. Behind the nginx ingress every app answers on 443 under its own
# hostname and these ports are closed, so `--base-url https://<domain>` reports
# a false platform-wide outage. Check that per host instead, e.g.
# `curl -fsS https://quantmail.in/api/healthz` (the ingress rewrites `/api/*`
# onto the backend, so `/api/healthz` reaches server-core's `/healthz`).
declare -a SERVICES=(
  "quantmail:3010:/api/health"
  "quantmail-backend:3011:/healthz"
  "quantchat:3015:/api/health"
  "quantai:3020:/api/health"
  "admin:3100:/api/healthz"
  "ws-gateway:8080:/health"
  "meilisearch:7700:/health"
)

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--base-url <url>]"
      echo ""
      echo "Options:"
      echo "  --base-url   Base URL for service endpoints (default: http://localhost)"
      echo ""
      echo "Environment variables:"
      echo "  BASE_URL     Alternative to --base-url flag"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "============================================"
echo " Quant Platform Health Check"
echo " Base URL: ${BASE_URL}"
echo " Timeout:  ${TIMEOUT}s per request"
echo "============================================"
echo ""

printf "%-18s %-8s %-10s %s\n" "SERVICE" "PORT" "STATUS" "RESPONSE TIME"
printf "%-18s %-8s %-10s %s\n" "-------" "----" "------" "-------------"

for service_def in "${SERVICES[@]}"; do
  # `${def##*:}` used to be read as the port, which silently becomes the path
  # once a third field exists. Split on every colon instead of guessing.
  IFS=':' read -r SERVICE_NAME SERVICE_PORT SERVICE_PATH <<< "$service_def"
  TOTAL=$((TOTAL + 1))

  URL="${BASE_URL}:${SERVICE_PORT}${SERVICE_PATH}"

  # Perform health check
  START_TIME=$(date +%s%N)
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" "$URL" 2>/dev/null || echo "000")
  END_TIME=$(date +%s%N)

  # Calculate response time in ms
  ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))

  if [[ "$HTTP_CODE" == "200" ]]; then
    STATUS="UP"
    COLOR="\033[0;32m"
  else
    STATUS="DOWN"
    COLOR="\033[0;31m"
    FAILED=$((FAILED + 1))
  fi

  RESET="\033[0m"
  printf "%-18s %-8s ${COLOR}%-10s${RESET} %sms (HTTP %s)\n" "$SERVICE_NAME" "$SERVICE_PORT" "$STATUS" "$ELAPSED_MS" "$HTTP_CODE"
done

echo ""
echo "============================================"
echo " Results: $((TOTAL - FAILED))/${TOTAL} services healthy"
echo "============================================"

if [[ $FAILED -gt 0 ]]; then
  echo ""
  echo "WARNING: ${FAILED} service(s) are unhealthy!"
  exit 1
fi

echo ""
echo "All services are healthy."
exit 0
