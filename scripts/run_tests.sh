#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."  # always run from the repo root

run_live_gee=0

for arg in "$@"; do
  case "$arg" in
    --live-gee)
      run_live_gee=1
      ;;
    -h|--help)
      cat <<'EOF'
Usage:
  scripts/run_tests.sh              Run local unit + mocked integration tests
  scripts/run_tests.sh --live-gee   Also run the real Google Earth Engine integration test

Notes:
  - Uses uv so the repo's Python 3.12 environment is respected.
  - The live GEE test requires Earth Engine credentials/project configuration.
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Run scripts/run_tests.sh --help for usage." >&2
      exit 2
      ;;
  esac
done

echo "Running pytest suite..."
uv run pytest -q

echo "Running unittest compatibility suite..."
uv run python -m unittest discover -v

if [[ "$run_live_gee" -eq 1 ]]; then
  echo "Running live Earth Engine integration test..."
  RUN_GEE_INTEGRATION_TESTS=1 uv run pytest tests/integration/test_gee_optical_cloud_cover_real.py -q
fi
