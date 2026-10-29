#!/usr/bin/env bash
# Makes the test data for a rollback check or golden run:
#   scripts/test-data.sh <root>
# <root>/working/{Belay,Learning,claude}: one copy of the real data, cleaned, with fixture issues seeded;
# <root>/pristine/: `cp -a` of working, taken before anything runs. claude/ is the fixture CLAUDE_CONFIG_DIR.
# Only reads the real dirs. Fixture issues are project FXT: fxt-1 canonical, fxt-2..6 plain unknown keys,
# fxt-101..110 non-plain unknown values (rollback-ops.ts sets those aside while it runs).
set -euo pipefail

[ $# -eq 1 ] || { echo "usage: test-data.sh <root>" >&2; exit 2; }
[ -e "$1" ] && { echo "test-data: $1 exists; pick a new root" >&2; exit 2; }
mkdir -p "$1"
root=$(cd "$1" && pwd)
w="$root/working"
mkdir -p "$w/claude/projects"

cp -a "$HOME/Belay" "$w/Belay"
cp -a "$HOME/Learning" "$w/Learning"
B="$w/Belay"

rm -f "$B"/grills/*/bridge.json "$B"/lessons/*/bridge.json "$B/.run/start.json" "$B/.run/restart"
rm -rf "$B/cache"
grep -q '^extensions:' "$B/settings.yaml" 2>/dev/null || printf 'extensions:\n  learn: on\n' >>"$B/settings.yaml"

cat >"$B/projects/fxt.md" <<'EOF'
---
key: FXT
name: Fixtures
paths:
  - C:/belay-fixtures
status: paused
focus: false
---
EOF

# issue <n> <frontmatter before id> <frontmatter after updated>
issue() {
  {
    printf -- '---\n%s' "$2"
    printf 'id: FXT-%s\ntitle: Fixture %s\nproject: FXT\nstatus: idea\nblocked_by: []\nsource: claude\ncreated: 2026-01-01\nupdated: 2026-01-01T09:00\n' "$1" "$1"
    printf '%s---\n' "$3"
  } >"$B/issues/fxt-$1.md"
}

cat >"$B/issues/fxt-1.md" <<'EOF'
---
id: FXT-1
title: Fixture 1, canonical with grill and plan
project: FXT
status: todo
blocked_by: []
source: user
grill: belay-plugin-architecture
plan: C:\Users\Nick\.claude\plans\fluffy-napping-canyon.md
created: 2026-01-01
updated: 2026-01-01T09:00
comments:
  - at: 2026-01-01T09:00
    by: user
    text: a comment
---

A body.
EOF
issue 2 '' $'estimate: 3\nnote: hello\n'
issue 3 '' $'meta:\n  a: 1\n  b:\n    - x\n    - y\n'
issue 4 '' $'tags:\n  - a\n  - b\n'
issue 5 '' $'2: two\n'
issue 6 $'first: true\n' ''

issue 101 '' $'x: .inf\n'
issue 102 '' $'a: &x foo\nb: *x\n'
issue 103 '' $'big: 12345678901234567890\n'
issue 104 '' $'z: -0\n'
issue 105 '' $'s: !!set {a: null}\n'
issue 106 '' $'o: !!omap [ {a: 1} ]\n'
issue 107 '' $'bin: !!binary aGVsbG8=\n'
issue 108 '' $'ts: !!timestamp 2026-01-01\n'
issue 109 '' $'c: !custom foo\n'
issue 110 '' $'__proto__:\n  polluted: true\n'

# Committed in the copy's own history, so the ops' commits show edits as edits.
git -C "$B" add settings.yaml projects/fxt.md 'issues/fxt-*.md'
git -C "$B" commit -q -m 'fixtures - test' -- settings.yaml projects/fxt.md 'issues/fxt-*.md'

cp -a "$w" "$root/pristine"
echo "test data ready: $root"
