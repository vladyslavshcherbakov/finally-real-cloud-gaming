#!/usr/bin/env bash
set -euo pipefail

repositoryRoot="$(cd "$(dirname "$0")/.." && pwd)"
port="${1:-8080}"
echo "Open http://localhost:$port/Apps/web/"
cd "$repositoryRoot"
exec python3 -m http.server "$port"
