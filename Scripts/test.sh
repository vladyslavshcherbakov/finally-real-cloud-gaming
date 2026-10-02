#!/usr/bin/env bash
set -euo pipefail

repositoryRoot="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repositoryRoot"

runStep() {
  local stepName="$1"
  shift
  local stepLog
  stepLog=$(mktemp)
  if "$@" > "$stepLog" 2>&1; then
    echo "$stepName: passed ($(grep -E '^# pass' "$stepLog" | grep -Eo '[0-9]+') tests)"
  else
    cat "$stepLog"
    echo "$stepName failed: $*"
    exit 1
  fi
}

runStep "Unit tests" node --test --test-reporter=tap Shared/Tests/*/*UnitTests.mjs
runStep "Integration tests" node --test --test-reporter=tap --test-concurrency=1 Apps/web/Tests/*/*IntegrationTests.mjs
