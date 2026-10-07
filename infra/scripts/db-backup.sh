#!/bin/bash
set -euo pipefail

# Database Backup Script
# Creates compressed PostgreSQL backups and uploads to S3.
# Manages retention: 30 daily, 12 weekly, 12 monthly backups.
#
# Usage: ./db-backup.sh
#
# Required environment variables:
#   DATABASE_URL - PostgreSQL connection string
#   S3_BUCKET    - S3 bucket name for backups
#   AWS_REGION   - AWS region

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
DATE=$(date +"%Y-%m-%d")
DAY_OF_WEEK=$(date +"%u")
DAY_OF_MONTH=$(date +"%d")
BACKUP_DIR="/tmp/quant-backups"
BACKUP_FILE="${BACKUP_DIR}/quant-${TIMESTAMP}.dump"
LOG_FILE="/tmp/db-backup-${TIMESTAMP}.log"

log() {
  local level="$1"
  shift
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [${level}] $*" | tee -a "$LOG_FILE"
}

cleanup() {
  log "INFO" "Cleaning up temporary files..."
  rm -rf "$BACKUP_DIR"
}

trap cleanup EXIT

# Validate required environment variables
if [[ -z "${DATABASE_URL:-}" ]]; then
  log "ERROR" "DATABASE_URL environment variable is required"
  exit 1
fi

if [[ -z "${S3_BUCKET:-}" ]]; then
  log "ERROR" "S3_BUCKET environment variable is required"
  exit 1
fi

if [[ -z "${AWS_REGION:-}" ]]; then
  log "ERROR" "AWS_REGION environment variable is required"
  exit 1
fi

log "INFO" "Starting database backup at ${TIMESTAMP}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Run pg_dump with custom format and max compression
log "INFO" "Running pg_dump..."
pg_dump "$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --verbose \
  --file="$BACKUP_FILE" \
  2>&1 | tee -a "$LOG_FILE"

BACKUP_SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null)
log "INFO" "Backup file size: ${BACKUP_SIZE} bytes"

# Verify backup integrity
log "INFO" "Verifying backup integrity..."
if pg_restore --list "$BACKUP_FILE" >/dev/null 2>&1; then
  log "INFO" "Backup integrity verified successfully"
else
  log "ERROR" "Backup integrity check failed!"
  exit 1
fi

# Upload daily backup
S3_DAILY_PATH="s3://${S3_BUCKET}/backups/daily/${DATE}/quant-${TIMESTAMP}.dump"
log "INFO" "Uploading daily backup to ${S3_DAILY_PATH}"
aws s3 cp "$BACKUP_FILE" "$S3_DAILY_PATH" --region "$AWS_REGION"

# Upload weekly backup (on Sundays)
if [[ "$DAY_OF_WEEK" == "7" ]]; then
  S3_WEEKLY_PATH="s3://${S3_BUCKET}/backups/weekly/${DATE}/quant-${TIMESTAMP}.dump"
  log "INFO" "Uploading weekly backup to ${S3_WEEKLY_PATH}"
  aws s3 cp "$BACKUP_FILE" "$S3_WEEKLY_PATH" --region "$AWS_REGION"
fi

# Upload monthly backup (on the 1st)
if [[ "$DAY_OF_MONTH" == "01" ]]; then
  S3_MONTHLY_PATH="s3://${S3_BUCKET}/backups/monthly/${DATE}/quant-${TIMESTAMP}.dump"
  log "INFO" "Uploading monthly backup to ${S3_MONTHLY_PATH}"
  aws s3 cp "$BACKUP_FILE" "$S3_MONTHLY_PATH" --region "$AWS_REGION"
fi

# Apply retention policy - keep last 30 daily backups
log "INFO" "Applying retention policy..."

# List and delete old daily backups (older than 30 days)
CUTOFF_DAILY=$(date -d "-30 days" +"%Y-%m-%d" 2>/dev/null || date -v-30d +"%Y-%m-%d" 2>/dev/null)
if [[ -n "$CUTOFF_DAILY" ]]; then
  aws s3 ls "s3://${S3_BUCKET}/backups/daily/" --region "$AWS_REGION" 2>/dev/null | while read -r line; do
    dir_date=$(echo "$line" | awk '{print $2}' | tr -d '/')
    if [[ "$dir_date" < "$CUTOFF_DAILY" ]]; then
      log "INFO" "Removing old daily backup: ${dir_date}"
      aws s3 rm "s3://${S3_BUCKET}/backups/daily/${dir_date}/" --recursive --region "$AWS_REGION"
    fi
  done
fi

# List and delete old weekly backups (older than 12 weeks / 84 days)
CUTOFF_WEEKLY=$(date -d "-84 days" +"%Y-%m-%d" 2>/dev/null || date -v-84d +"%Y-%m-%d" 2>/dev/null)
if [[ -n "$CUTOFF_WEEKLY" ]]; then
  aws s3 ls "s3://${S3_BUCKET}/backups/weekly/" --region "$AWS_REGION" 2>/dev/null | while read -r line; do
    dir_date=$(echo "$line" | awk '{print $2}' | tr -d '/')
    if [[ "$dir_date" < "$CUTOFF_WEEKLY" ]]; then
      log "INFO" "Removing old weekly backup: ${dir_date}"
      aws s3 rm "s3://${S3_BUCKET}/backups/weekly/${dir_date}/" --recursive --region "$AWS_REGION"
    fi
  done
fi

# List and delete old monthly backups (older than 12 months / 365 days)
CUTOFF_MONTHLY=$(date -d "-365 days" +"%Y-%m-%d" 2>/dev/null || date -v-365d +"%Y-%m-%d" 2>/dev/null)
if [[ -n "$CUTOFF_MONTHLY" ]]; then
  aws s3 ls "s3://${S3_BUCKET}/backups/monthly/" --region "$AWS_REGION" 2>/dev/null | while read -r line; do
    dir_date=$(echo "$line" | awk '{print $2}' | tr -d '/')
    if [[ "$dir_date" < "$CUTOFF_MONTHLY" ]]; then
      log "INFO" "Removing old monthly backup: ${dir_date}"
      aws s3 rm "s3://${S3_BUCKET}/backups/monthly/${dir_date}/" --recursive --region "$AWS_REGION"
    fi
  done
fi

log "INFO" "Backup completed successfully"
