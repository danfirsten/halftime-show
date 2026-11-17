#!/bin/bash
# labels.sh owner/name: create or update the Sasori labels (knowledge/labels.json) in a repo. Idempotent. REST only,
# so it works from a cloud session (with GH_TOKEN blank) and from Actions.
set -uo pipefail
R=${1:?usage: labels.sh owner/name}
L="$(cd "$(dirname "$0")/.." && pwd)/knowledge/labels.json"; [ -f "$L" ] || L="$(dirname "$0")/labels.json"
have=$(gh api "repos/$R/labels?per_page=100" --paginate -q '.[].name' 2>/dev/null)
jq -c '.[]' "$L" | while read -r l; do
  n=$(jq -r .name <<<"$l"); c=$(jq -r .color <<<"$l"); d=$(jq -r .description <<<"$l")
  if grep -qxF "$n" <<<"$have"; then gh api -X PATCH "repos/$R/labels/$(jq -rn --arg n "$n" '$n|@uri')" -f color="$c" -f description="$d" >/dev/null 2>&1 && echo "  ok      $n"
  else gh api -X POST "repos/$R/labels" -f name="$n" -f color="$c" -f description="$d" >/dev/null 2>&1 && echo "  created $n" || echo "  FAILED  $n"; fi
done
