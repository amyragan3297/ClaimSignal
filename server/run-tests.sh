#!/usr/bin/env bash
# Runs all server/*.test.ts files and reports a combined pass/fail result.
# Exit code is non-zero if any test file fails.

set -euo pipefail

PASS=0
FAIL=0
FAILED_FILES=()

for f in server/*.test.ts; do
  echo "▶ Running $f"
  if npx tsx "$f"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_FILES+=("$f")
  fi
  echo ""
done

echo "============================="
echo "Results: $PASS passed, $FAIL failed"

if [ ${#FAILED_FILES[@]} -gt 0 ]; then
  echo "Failed:"
  for f in "${FAILED_FILES[@]}"; do
    echo "  ✗ $f"
  done
  exit 1
fi

echo "All tests passed."
exit 0
