#!/usr/bin/env bash
set -euo pipefail

echo "=== Verify State Files ==="
echo ""

errors=0

# --- Count actual directories ---
actual_apps=$(ls apps/ | wc -l | tr -d ' ')
actual_packages=$(ls packages/ | wc -l | tr -d ' ')
actual_services=$(ls services/ | wc -l | tr -d ' ')

# --- Extract expected counts from architecture map ---
arch_map=".agents/state/quant-architecture-map.md"

if [ ! -f "$arch_map" ]; then
  echo "ERROR: Architecture map not found at $arch_map"
  exit 1
fi

expected_apps=$(grep -Eo '\*\*[0-9]+ apps?\*\*' "$arch_map" | grep -Eo '[0-9]+' | head -1)
expected_packages=$(grep -Eo '\*\*[0-9]+ packages?\*\*' "$arch_map" | grep -Eo '[0-9]+' | head -1)
expected_services=$(grep -Eo '\*\*[0-9]+ services?\*\*' "$arch_map" | grep -Eo '[0-9]+' | head -1)

if [ -z "${expected_apps:-}" ]; then
  echo "ERROR: Could not extract expected apps count from $arch_map"
  errors=1
fi
if [ -z "${expected_packages:-}" ]; then
  echo "ERROR: Could not extract expected packages count from $arch_map"
  errors=1
fi
if [ -z "${expected_services:-}" ]; then
  echo "ERROR: Could not extract expected services count from $arch_map"
  errors=1
fi

if [ "$errors" -ne 0 ]; then
  exit 1
fi

# --- Compare counts ---
echo "Apps:     expected=$expected_apps  actual=$actual_apps"
if [ "$actual_apps" != "$expected_apps" ]; then
  echo "  MISMATCH: apps/ has $actual_apps directories but architecture map claims $expected_apps"
  errors=$((errors + 1))
else
  echo "  OK"
fi

echo "Packages: expected=$expected_packages  actual=$actual_packages"
if [ "$actual_packages" != "$expected_packages" ]; then
  echo "  MISMATCH: packages/ has $actual_packages directories but architecture map claims $expected_packages"
  errors=$((errors + 1))
else
  echo "  OK"
fi

echo "Services: expected=$expected_services  actual=$actual_services"
if [ "$actual_services" != "$expected_services" ]; then
  echo "  MISMATCH: services/ has $actual_services directories but architecture map claims $expected_services"
  errors=$((errors + 1))
else
  echo "  OK"
fi

echo ""

# --- Validate quant-autonomous-status.json ---
status_file=".agents/state/quant-autonomous-status.json"

echo "=== Validate $status_file ==="

if [ ! -f "$status_file" ]; then
  echo "ERROR: Status file not found at $status_file"
  exit 1
fi

if ! python3 -c "import json, sys; json.load(open('$status_file'))" 2>/dev/null; then
  echo "ERROR: $status_file is not valid JSON"
  errors=$((errors + 1))
else
  echo "  Valid JSON: OK"
fi

# NOTE: This checks that the status file claims all gates pass.
# Actual gate execution is handled by ci.yml (typecheck, build, test, lint, audit).
# Check all gates are "pass"
gate_failures=$(python3 -c "
import json, sys
with open('$status_file') as f:
    data = json.load(f)
gates = data.get('gates', {})
if not gates:
    print('NO_GATES')
    sys.exit(0)
failures = [k for k, v in gates.items() if v != 'pass']
if failures:
    print(' '.join(failures))
")

if [ "$gate_failures" = "NO_GATES" ]; then
  echo "  WARNING: No gates found in status file"
  errors=$((errors + 1))
elif [ -n "$gate_failures" ]; then
  echo "  FAIL: Gates not passing: $gate_failures"
  errors=$((errors + 1))
else
  echo "  All gates pass: OK"
fi

echo ""

# --- Summary ---
if [ "$errors" -ne 0 ]; then
  echo "FAILED: $errors error(s) detected"
  exit 1
else
  echo "ALL CHECKS PASSED"
  exit 0
fi
