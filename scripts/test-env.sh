#!/usr/bin/env bash
# Runs a command against a test working copy (made by test-data.sh), never the real data:
#   scripts/test-env.sh <working copy> <command> [args...]
# The working copy holds Belay/ and Learning/. Every Node child loads scripts/guard.ts, which throws if the env
# would reach the real ~/Belay or ~/Learning.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: test-env.sh <working copy> <command> [args...]" >&2
  exit 2
fi

root=$(cd "$1" && pwd)
shift
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
win() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

for d in Belay Learning; do
  [ -d "$root/$d" ] || { echo "test-env: $root/$d is missing (run test-data.sh)" >&2; exit 2; }
done

export BELAY_GUARD_HOME
BELAY_GUARD_HOME=$(win "$HOME")
export BELAY_DATA LEARNING_ROOT
BELAY_DATA=$(win "$root/Belay")
LEARNING_ROOT=$(win "$root/Learning")
export BELAY_SITE_PORT=4848
export NODE_OPTIONS="--import=file:///$(win "$here/guard.ts" | sed 's#^/##')"

node -e '' || { echo "test-env: the guard refused this env" >&2; exit 2; }
exec "$@"
