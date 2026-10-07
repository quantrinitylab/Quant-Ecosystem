#!/bin/bash
set -euo pipefail

# Canary Promotion Script
# Manually promotes or aborts an Argo Rollouts canary deployment.
#
# Usage: ./canary-promote.sh [--namespace <ns>] [--action <promote|abort>] [--service <name>]
#
# Options:
#   --namespace  Kubernetes namespace (default: quant-production)
#   --action     Action to take: promote or abort (default: promote)
#   --service    Service name to promote (default: all)

NAMESPACE="${NAMESPACE:-quant-production}"
ACTION="${ACTION:-promote}"
SERVICE="${SERVICE:-all}"
RELEASE_NAME="quant-platform"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    --action)
      ACTION="$2"
      shift 2
      ;;
    --service)
      SERVICE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--namespace <ns>] [--action <promote|abort>] [--service <name>]"
      echo ""
      echo "Options:"
      echo "  --namespace  Kubernetes namespace (default: quant-production)"
      echo "  --action     Action to take: promote or abort (default: promote)"
      echo "  --service    Service name to promote/abort (default: all)"
      echo ""
      echo "Examples:"
      echo "  $0 --action promote --service identity"
      echo "  $0 --action abort --service chat-api"
      echo "  $0 --action promote  # promotes all canaries"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate action
if [[ "$ACTION" != "promote" && "$ACTION" != "abort" ]]; then
  echo "ERROR: Action must be 'promote' or 'abort'"
  exit 1
fi

echo "============================================"
echo " Quant Platform Canary ${ACTION^}"
echo " Namespace: ${NAMESPACE}"
echo " Service:   ${SERVICE}"
echo " Time:      $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================"
echo ""

# Check kubectl connectivity
if ! kubectl cluster-info > /dev/null 2>&1; then
  echo "ERROR: Cannot connect to Kubernetes cluster"
  exit 1
fi

# Check that Argo Rollouts plugin is available
if ! kubectl argo rollouts version > /dev/null 2>&1; then
  echo "ERROR: kubectl argo rollouts plugin is not installed"
  echo "Install: https://argoproj.github.io/argo-rollouts/installation/#kubectl-plugin-installation"
  exit 1
fi

# Get list of rollouts
get_rollouts() {
  if [[ "$SERVICE" == "all" ]]; then
    kubectl get rollouts -n "$NAMESPACE" -l "app.kubernetes.io/instance=${RELEASE_NAME}" -o name 2>/dev/null
  else
    echo "rollout/${RELEASE_NAME}-${SERVICE}-canary"
  fi
}

ROLLOUTS=$(get_rollouts)

if [[ -z "$ROLLOUTS" ]]; then
  echo "No canary rollouts found in namespace ${NAMESPACE}"
  exit 1
fi

echo "Found rollouts:"
echo "$ROLLOUTS" | while read -r rollout; do
  echo "  - ${rollout}"
done
echo ""

# Confirm action
echo "About to ${ACTION} the above rollouts."
echo "Press Ctrl+C within 5 seconds to cancel..."
sleep 5
echo ""

# Execute action
FAILED=0
TOTAL=0

echo "$ROLLOUTS" | while read -r rollout; do
  TOTAL=$((TOTAL + 1))
  ROLLOUT_NAME="${rollout#rollout/}"
  echo "Processing: ${ROLLOUT_NAME}"

  # Check current status
  STATUS=$(kubectl argo rollouts status "$ROLLOUT_NAME" -n "$NAMESPACE" --timeout 5s 2>/dev/null || echo "Unknown")
  echo "  Current status: ${STATUS}"

  if [[ "$ACTION" == "promote" ]]; then
    if kubectl argo rollouts promote "$ROLLOUT_NAME" -n "$NAMESPACE" 2>/dev/null; then
      echo "  Promoted successfully"
    else
      echo "  ERROR: Failed to promote"
      FAILED=$((FAILED + 1))
    fi
  else
    if kubectl argo rollouts abort "$ROLLOUT_NAME" -n "$NAMESPACE" 2>/dev/null; then
      echo "  Aborted successfully"
    else
      echo "  ERROR: Failed to abort"
      FAILED=$((FAILED + 1))
    fi
  fi
  echo ""
done

echo "============================================"
echo " Canary ${ACTION^} Complete"
echo "============================================"
echo ""
echo "Next steps:"
if [[ "$ACTION" == "promote" ]]; then
  echo "  1. Monitor service metrics in Grafana"
  echo "  2. Check error rates in Prometheus"
  echo "  3. Verify synthetic canaries are green"
  echo "  4. If issues arise, run: $0 --action abort --service <name>"
else
  echo "  1. Investigate root cause of the issue"
  echo "  2. Check rollout analysis results:"
  echo "     kubectl argo rollouts get <rollout-name> -n ${NAMESPACE}"
  echo "  3. Fix the issue and redeploy"
fi
