#!/usr/bin/env bash
# The rollback check and CLI goldens, master against branch:
#   scripts/rollback-check.sh <new test root> <master code root> <branch code root> [--paths-master <json>] [--paths-branch <json>]
# Run it from a frozen copy of scripts/ (the one in this dir is used). Makes fresh test data, then:
#   1. CLI goldens from both roots on the same working copy, diffed, and the web's pure goldens (page goldens need
#      both sites served: see goldens-pages.ts);
#   2. ops: branch on the working copy, master on a fresh copy of pristine; both logs must pass, and diff equal;
#   3. each copy differs from pristine only by its ops' edits;
#   4. the branch reads twice (cold, warm) and master reads lenient and strict; the reports are kept for review,
#      and the branch's two must match;
#   5. the bridge harness on copies of both roots' plugin/ (built, with node_modules), each bridge with each root's
#      site helpers: no failed assertions, and all four transcripts equal;
#   6. the tripwire never fired.
# Prints the real data dir's commits since the start, to check by eye that they're ordinary ops.
set -uo pipefail

[ $# -ge 3 ] || { echo "usage: rollback-check.sh <new test root> <master root> <branch root> [--paths-master <json>] [--paths-branch <json>]" >&2; exit 2; }
T=$1 M=$2 B=$3
shift 3
PM=() PB=()
while [ $# -gt 0 ]; do
  case $1 in
    --paths-master) PM=(--paths "$2"); shift 2 ;;
    --paths-branch) PB=(--paths "$2"); shift 2 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
S=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
start=$(date '+%Y-%m-%d %H:%M:%S')
trip=$(node -p "require('path').join(require('os').tmpdir(), 'belay-tripwire.log')")
trip_before=$(wc -c <"$trip" 2>/dev/null || echo 0)
fail=0
step() { printf '\n== %s\n' "$1"; }
check() { if "$@"; then echo "pass"; else echo "FAIL"; fail=1; fi; }
quiet() { grep -v -e 'YAMLWarning' -e '^c: !custom' -e '^   \^' -e 'trace-warnings' -e '^$' || true; }

"$S/test-data.sh" "$T" || exit 2
T=$(cd "$T" && pwd)
cp -a "$T/pristine" "$T/master-run"
env_w() { "$S/test-env.sh" "$T/working" "$@"; }
env_m() { "$S/test-env.sh" "$T/master-run" "$@"; }

step "goldens"
env_w node "$S/goldens-cli.ts" "$M" --out "$T/goldens-master" "${PM[@]}"
env_w node "$S/goldens-cli.ts" "$B" --out "$T/goldens-branch" "${PB[@]}"
check diff -r "$T/goldens-master" "$T/goldens-branch"

step "web pure goldens"
node "$S/goldens-pure.ts" "$M" --out "$T/pure-master.json" "${PM[@]}"
node "$S/goldens-pure.ts" "$B" --out "$T/pure-branch.json" "${PB[@]}"
check diff "$T/pure-master.json" "$T/pure-branch.json"

step "ops"
env_w node "$S/rollback-ops.ts" "$B" --out "$T/ops-branch.json" "${PB[@]}" 2>&1 | quiet
env_m node "$S/rollback-ops.ts" "$M" --out "$T/ops-master.json" "${PM[@]}" 2>&1 | quiet
check node -e "for (const f of process.argv.slice(1)) if (require(f).failed.length) process.exit(1)" "$T/ops-branch.json" "$T/ops-master.json"
check diff "$T/ops-master.json" "$T/ops-branch.json"

step "only the ops' edits"
check node "$S/rollback-compare.ts" "$T/working" "$T/pristine" "$T/ops-branch.json"
check node "$S/rollback-compare.ts" "$T/master-run" "$T/pristine" "$T/ops-master.json"

step "reads"
env_w node "$S/rollback-read.ts" "$B" --out "$T/read-branch-1.json" "${PB[@]}" 2>&1 | quiet
env_w node "$S/rollback-read.ts" "$B" --out "$T/read-branch-2.json" "${PB[@]}" 2>&1 | quiet
env_w node "$S/rollback-read.ts" "$M" --strict --out "$T/read-master.json" "${PM[@]}" 2>&1 | quiet
check diff "$T/read-branch-1.json" "$T/read-branch-2.json"
echo "reports: $T/read-*.json"

step "bridge"
cp -a "$M/plugin" "$T/plugin-master"
cp -a "$B/plugin" "$T/plugin-branch"
for b in master branch; do
  for s in master branch; do
    if [ $s = master ]; then root=$M paths=("${PM[@]}"); else root=$B paths=("${PB[@]}"); fi
    env_w node "$S/bridge-harness.ts" "$T/plugin-$b" "$root" --out "$T/bridge-$b-$s.json" "${paths[@]}"
  done
done
check node -e "for (const f of process.argv.slice(1)) if (require(f).failed.length) process.exit(1)" "$T"/bridge-*.json
for f in "$T"/bridge-{master-branch,branch-master,branch-branch}.json; do check diff "$T/bridge-master-master.json" "$f"; done

step "tripwire"
trip_after=$(wc -c <"$trip" 2>/dev/null || echo 0)
check [ "$trip_before" = "$trip_after" ]

step "real data commits since $start (check by eye)"
git -C "$HOME/Belay" log --since="$start" --format='%h %s'

echo
[ $fail = 0 ] && echo "ROLLBACK CHECK PASSED" || echo "ROLLBACK CHECK FAILED"
exit $fail
