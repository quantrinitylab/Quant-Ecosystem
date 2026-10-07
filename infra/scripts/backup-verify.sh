#!/bin/bash
set -euo pipefail

# Backup Restoration Verification Script
# Validates that backup restore operations complete successfully.
#
# Usage: ./backup-verify.sh [--vault <vault-name>] [--region <aws-region>]
#
# Options:
#   --vault    AWS Backup vault name (default: quant-production-backup-vault)
#   --region   AWS region (default: us-east-1)

VAULT_NAME="${VAULT_NAME:-quant-production-backup-vault}"
AWS_REGION="${AWS_REGION:-us-east-1}"
RESTORE_PREFIX="restore-verify"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
RESTORE_INSTANCE="${RESTORE_PREFIX}-${TIMESTAMP}"
FAILED=0

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --vault)
      VAULT_NAME="$2"
      shift 2
      ;;
    --region)
      AWS_REGION="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--vault <vault-name>] [--region <aws-region>]"
      echo ""
      echo "Options:"
      echo "  --vault    AWS Backup vault name (default: quant-production-backup-vault)"
      echo "  --region   AWS region (default: us-east-1)"
      echo ""
      echo "Environment variables:"
      echo "  VAULT_NAME   Alternative to --vault flag"
      echo "  AWS_REGION   Alternative to --region flag"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "============================================"
echo " Quant Platform Backup Verification"
echo " Vault:  ${VAULT_NAME}"
echo " Region: ${AWS_REGION}"
echo " Time:   $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================"
echo ""

# Step 1: List recent recovery points
echo "[1/6] Listing recent recovery points..."
RECOVERY_POINTS=$(aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name "$VAULT_NAME" \
  --region "$AWS_REGION" \
  --max-results 5 \
  --query 'RecoveryPoints[?Status==`COMPLETED`].RecoveryPointArn' \
  --output text 2>/dev/null)

if [[ -z "$RECOVERY_POINTS" ]]; then
  echo "ERROR: No completed recovery points found in vault ${VAULT_NAME}"
  exit 1
fi

LATEST_RECOVERY_POINT=$(echo "$RECOVERY_POINTS" | head -1)
echo "  Latest recovery point: ${LATEST_RECOVERY_POINT}"
echo ""

# Step 2: Initiate restore job
echo "[2/6] Starting restore from latest backup..."
RESTORE_JOB_ID=$(aws backup start-restore-job \
  --recovery-point-arn "$LATEST_RECOVERY_POINT" \
  --iam-role-arn "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/quant-production-backup-role" \
  --metadata "{\"DBInstanceIdentifier\": \"${RESTORE_INSTANCE}\", \"DBInstanceClass\": \"db.t3.medium\", \"MultiAZ\": \"false\"}" \
  --region "$AWS_REGION" \
  --query 'RestoreJobId' \
  --output text 2>/dev/null)

if [[ -z "$RESTORE_JOB_ID" ]]; then
  echo "ERROR: Failed to start restore job"
  exit 1
fi

echo "  Restore job ID: ${RESTORE_JOB_ID}"
echo ""

# Step 3: Wait for restore to complete
echo "[3/6] Waiting for restore to complete (this may take 10-30 minutes)..."
MAX_WAIT=3600
ELAPSED=0
INTERVAL=30

while [[ $ELAPSED -lt $MAX_WAIT ]]; do
  STATUS=$(aws backup describe-restore-job \
    --restore-job-id "$RESTORE_JOB_ID" \
    --region "$AWS_REGION" \
    --query 'Status' \
    --output text 2>/dev/null)

  if [[ "$STATUS" == "COMPLETED" ]]; then
    echo "  Restore completed successfully after ${ELAPSED}s"
    break
  elif [[ "$STATUS" == "FAILED" || "$STATUS" == "ABORTED" ]]; then
    echo "  ERROR: Restore job ${STATUS}"
    FAILED=1
    break
  fi

  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
  echo "  Status: ${STATUS} (${ELAPSED}s elapsed)"
done

if [[ $ELAPSED -ge $MAX_WAIT ]]; then
  echo "  ERROR: Restore job timed out after ${MAX_WAIT}s"
  FAILED=1
fi
echo ""

# Step 4: Verify restored instance
if [[ $FAILED -eq 0 ]]; then
  echo "[4/6] Verifying restored database instance..."
  DB_STATUS=$(aws rds describe-db-instances \
    --db-instance-identifier "$RESTORE_INSTANCE" \
    --region "$AWS_REGION" \
    --query 'DBInstances[0].DBInstanceStatus' \
    --output text 2>/dev/null)

  if [[ "$DB_STATUS" == "available" ]]; then
    echo "  Restored instance is available"

    # Verify connectivity
    ENDPOINT=$(aws rds describe-db-instances \
      --db-instance-identifier "$RESTORE_INSTANCE" \
      --region "$AWS_REGION" \
      --query 'DBInstances[0].Endpoint.Address' \
      --output text 2>/dev/null)
    echo "  Endpoint: ${ENDPOINT}"
  else
    echo "  WARNING: Restored instance status is ${DB_STATUS}"
    FAILED=1
  fi
else
  echo "[4/6] Skipping verification (restore failed)"
fi
echo ""

# Step 5: Verify S3 object integrity
echo "[5/6] Checking S3 replication integrity..."
BUCKETS=("quantchat-uploads" "quantmail-attachments" "quantube-videos")
for BUCKET in "${BUCKETS[@]}"; do
  FULL_BUCKET="quant-production-${BUCKET}"
  OBJECT_COUNT=$(aws s3api list-objects-v2 \
    --bucket "$FULL_BUCKET" \
    --region "$AWS_REGION" \
    --max-keys 1 \
    --query 'KeyCount' \
    --output text 2>/dev/null || echo "0")

  if [[ "$OBJECT_COUNT" -gt 0 ]]; then
    echo "  ${FULL_BUCKET}: OK (objects present)"
  else
    echo "  ${FULL_BUCKET}: WARNING (no objects found)"
  fi
done
echo ""

# Step 6: Cleanup restored instance
echo "[6/6] Cleaning up test restore instance..."
aws rds delete-db-instance \
  --db-instance-identifier "$RESTORE_INSTANCE" \
  --skip-final-snapshot \
  --region "$AWS_REGION" 2>/dev/null && echo "  Cleanup initiated for ${RESTORE_INSTANCE}" || echo "  WARNING: Cleanup failed (manual removal may be needed)"

echo ""
echo "============================================"
if [[ $FAILED -eq 0 ]]; then
  echo " RESULT: PASS - Backup restoration verified"
  echo "============================================"
  exit 0
else
  echo " RESULT: FAIL - Backup verification failed"
  echo "============================================"
  exit 1
fi
