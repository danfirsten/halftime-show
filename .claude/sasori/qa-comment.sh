#!/bin/bash
# qa-comment.sh <qa-dir> <owner/repo> <pr> <sha>: publish a QA run's screenshots and motion strips to the repo's
# sasori-qa branch (one folder per PR, so GitHub serves them to people who can see the repo) and post or update the
# PR's one QA comment. Used by the QA workflow and by `sasori ci` (session CI). The pictures never fail the run.
# QA_REMOTE overrides where the sasori-qa branch is pushed (default: with $GH_TOKEN when set, else plain https).
set -e
Q=$1; REPO=$2; PR=$3; SHA=$4
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
remote=${QA_REMOTE:-$([ -n "${GH_TOKEN:-}" ] && echo "https://x-access-token:$GH_TOKEN@github.com/$REPO" || echo "https://github.com/$REPO.git")}
gq() { git -C "$W/b" -c user.name=sasori-qa -c user.email=sasori-qa@users.noreply.github.com "$@"; }
dir="pr-$PR"; pushed=false
if git ls-remote --exit-code --heads "$remote" sasori-qa >/dev/null 2>&1; then
  git clone -q --depth 1 --branch sasori-qa "$remote" "$W/b"
else
  git init -q -b sasori-qa "$W/b"; gq remote add origin "$remote"
fi
rm -rf "$W/b/$dir"; mkdir -p "$W/b/$dir"; cp "$Q"/*.png "$W/b/$dir/" 2>/dev/null || true
gq add -A; gq commit -qm "QA screenshots for #$PR" || true
for i in 1 2 3 4 5; do   # other PRs push to the same branch: rebase and retry
  if gq push -q origin sasori-qa 2>/dev/null; then pushed=true; break; fi
  gq pull -q --rebase origin sasori-qa 2>/dev/null || true; sleep $((i * 2))
done
url() { echo "https://github.com/$REPO/blob/sasori-qa/$dir/$1?raw=true"; }
{
  echo "<!-- sasori:qa -->"
  cat "$Q/report.md"
  if [ "$pushed" != true ]; then echo; echo "Screenshots couldn't be published this run."; fi
  echo; echo "<details><summary>Screenshots at ${SHA::7}</summary>"; echo
  for route in $(jq -r '.screenshots[]' "$Q/report.json" | sed -E 's/-[0-9]+-(light|dark)\.png$//' | sort -u); do
    echo "**$route**"; echo; echo "| Width | Light | Dark |"; echo "|---|---|---|"
    for w in $(jq -r '.widths[]' "$Q/report.json"); do
      echo "| $w | <img src=\"$(url "$route-$w-light.png")\" width=\"280\"> | <img src=\"$(url "$route-$w-dark.png")\" width=\"280\"> |"
    done; echo
  done
  echo "</details>"
  if [ "$(jq '.strips // [] | length' "$Q/report.json")" != 0 ]; then
    echo; echo "<details><summary>Motion strips at ${SHA::7}</summary>"; echo
    echo "| Interaction | Motion on | Reduced motion |"; echo "|---|---|---|"
    jq -r '.strips[] | select(.reduced | not) | [.route, .label + (if .moment then " (the moment)" else "" end), .file] | @tsv' "$Q/report.json" |
      while IFS=$'\t' read -r r l f; do
        rf="${f%-motion.png}-reduced.png"; [ -f "$Q/$rf" ] && red="<img src=\"$(url "$rf")\" width=\"420\">" || red="not filmed"
        echo "| \`$r\` $l | <img src=\"$(url "$f")\" width=\"420\"> | $red |"
      done
    echo; echo "</details>"
  fi
} > "$W/comment.md"
id=$(gh api "repos/$REPO/issues/$PR/comments?per_page=100" --paginate \
       -q '.[] | select(.body | startswith("<!-- sasori:qa -->")) | .id' | head -1)
if [ -n "$id" ]; then gh api -X PATCH "repos/$REPO/issues/comments/$id" -F body=@"$W/comment.md" >/dev/null
else gh api -X POST "repos/$REPO/issues/$PR/comments" -F body=@"$W/comment.md" >/dev/null; fi
