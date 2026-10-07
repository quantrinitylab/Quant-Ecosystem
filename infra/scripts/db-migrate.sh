#!/bin/bash
set -euo pipefail

# Database Migration Script
# Runs Prisma migrations with proper error handling and rollback support.
#
# Usage: ./db-migrate.sh --env <staging|production>
#
# Required environment variables:
#   DATABASE_URL - PostgreSQL connection string

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENVIRONMENT=""
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_FILE="/tmp/db-migrate-${TIMESTAMP}.log"

log() {
  local level="$1"
  shift
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [${level}] $*" | tee -a "$LOG_FILE"
}

usage() {
  echo "Usage: $0 --env <staging|production>"
  echo ""
  echo "Options:"
  echo "  --env    Target environment (staging or production)"
  echo ""
  echo "Required environment variables:"
  echo "  DATABASE_URL   PostgreSQL connection string"
  exit 1
}

rollback() {
  log "ERROR" "Migration failed! Initiating rollback..."
  log "ERROR" "Please check the migration status and resolve manually."
  log "ERROR" "Log file: ${LOG_FILE}"

  # Send notification on failure
  if command -v aws &>/dev/null && [ -n "${AWS_REGION:-}" ]; then
    aws logs put-log-events \
      --log-group-name "/quant/migrations" \
      --log-stream-name "${ENVIRONMENT}" \
      --log-events "timestamp=$(date +%s%3N),message=Migration failed at ${TIMESTAMP}" \
      2>/dev/null || true
  fi

  exit 1
}

trap rollback ERR

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1"
      usage
      ;;
  esac
done

# Validate inputs
if [[ -z "$ENVIRONMENT" ]]; then
  log "ERROR" "Environment is required"
  usage
fi

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
  log "ERROR" "Environment must be 'staging' or 'production'"
  usage
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  log "ERROR" "DATABASE_URL environment variable is required"
  exit 1
fi

log "INFO" "Starting database migration for environment: ${ENVIRONMENT}"
log "INFO" "Timestamp: ${TIMESTAMP}"

# Run Prisma migrate deploy
log "INFO" "Running prisma migrate deploy..."
cd "$PROJECT_ROOT"

if npx prisma migrate deploy 2>&1 | tee -a "$LOG_FILE"; then
  log "INFO" "Migration completed successfully"
else
  log "ERROR" "Migration command failed"
  rollback
fi

# Log to CloudWatch if available
if command -v aws &>/dev/null && [ -n "${AWS_REGION:-}" ]; then
  aws logs put-log-events \
    --log-group-name "/quant/migrations" \
    --log-stream-name "${ENVIRONMENT}" \
    --log-events "timestamp=$(date +%s%3N),message=Migration succeeded at ${TIMESTAMP}" \
    2>/dev/null || true
fi

log "INFO" "Migration complete. Log file: ${LOG_FILE}"
