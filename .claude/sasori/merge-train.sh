#!/bin/bash
# Sasori merge train: merges approved, green PRs into the default branch one at a time, keeps stacks rebased,
# halts when the default branch goes red, and reverts the culprit. It runs CI itself (session CI, scripts/ci.sh), so
# no Actions minutes. REST only (`gh api`), since GraphQL is blocked in Claude Code cloud sessions. Any GitHub plan.
#
#   merge-train.sh --repo owner/name [--base main] [--method squash|merge|rebase] [--mode fast|strict]
#                  [--require "CI=ci.yml,QA=sasori-qa.yml"] [--timeout 1800] [--dir <checkout>] [--trust <login>]
#                  [--auto-revert] [--dry-run] [--json]
#
# Eligible: open, not a draft, targets the base, and the latest trusted verdict comment (first line
# <!-- sasori:verdict APPROVE sha=<40 hex> base=<40 hex> -->, base= being the merge-base it was reviewed against) covers the head: the head adds nothing on top of the reviewed
# commit but clean merges from the base.
#
# --require      the workflows that must pass at a commit, as Name=file pairs (default: the base config's "workflows"
#                map, else CI=ci.yml). Each is a commit status sasori/<name> from a trusted login, or this train's own
#                run there. Missing or stale (pending over SASORI_CI_STALE seconds, default 3600), or an error (the
#                checks couldn't run), means the train runs scripts/ci.sh on that commit itself and posts them: at a
#                head it may merge, after updating a branch, and on the base after every merge, which it re-checks
#                before going on
# --mode fast    (default) merge at once when the required workflows passed at the head and no file it changes
#                changed on the base since it branched; otherwise update the branch and wait for them
# --mode strict  always update and re-test when the base has moved
# --timeout 0    never wait: skip what hasn't finished (the next run picks it up)
# --trust        whose verdicts and statuses count (default: the authenticated user, else the repo owner)
# --auto-revert  base red and the commit before it green: open a revert PR, merge it once green and exactly that
#                earlier tree, and reopen the issues the reverted PR fixed
#
# While the base is red, a PR whose body has "Sasori-Fixes-Base: <sha of the red commit>" may still merge when it's
# approved, green and contains the red commit: the way out when there's nothing to revert to.
#
# Exit 0 ran, 3 halted (base is red), 1 usage or setup error.
set -uo pipefail

REPO=""; BASE=""; METHOD="squash"; MODE="fast"; TIMEOUT=1800; DIR=""; DRY=0; JSON=0; TRUST=""; REVERT=0
REQUIRE=""; ARGS=("$@")
POLL=${SASORI_POLL:-20}; NOCI_GRACE=${SASORI_NOCI_GRACE:-180}; UPDATE_POLL=${SASORI_UPDATE_POLL:-3}
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO=$2; shift ;; --base) BASE=$2; shift ;; --method) METHOD=$2; shift ;;
    --mode) MODE=$2; shift ;; --timeout) TIMEOUT=$2; shift ;; --dir) DIR=$2; shift ;;
    --trust) TRUST=$2; shift ;; --require) REQUIRE=$2; shift ;;
    --auto-revert) REVERT=1 ;; --dry-run) DRY=1 ;; --json) JSON=1 ;;
    -h|--help) sed -n '2,27p' "$0"; exit 0 ;;
    *) echo "unknown argument $1" >&2; exit 1 ;;
  esac; shift
done
[ -n "$REPO" ] || { echo "usage: merge-train.sh --repo owner/name" >&2; exit 1; }
case "$METHOD" in squash|merge|rebase) ;; *) echo "--method is squash, merge or rebase" >&2; exit 1 ;; esac

MERGED=(); FAILED=(); SKIPPED=(); NOTES=()
[ -n "${SASORI_TRAIN_MERGED:-}" ] && mapfile -t MERGED <<<"$SASORI_TRAIN_MERGED"   # merged before a restart to revert
log() { if [ "$JSON" = 1 ]; then echo "$*" >&2; else echo "$*"; fi; }
finish() {
  [ "$JSON" = 1 ] || return 0
  jq -nc --arg repo "$REPO" --argjson halted "${1:-false}" --arg haltSha "${2:-}" \
    '{repo:$repo, halted:$halted, haltSha:$haltSha,
      merged:[$ARGS.positional[] | select(startswith("M ")) | .[2:]],
      failed:[$ARGS.positional[] | select(startswith("F ")) | .[2:]],
      skipped:[$ARGS.positional[] | select(startswith("S ")) | .[2:]],
      notes:[$ARGS.positional[] | select(startswith("N ")) | .[2:]]}' \
    --args "${MERGED[@]/#/M }" "${FAILED[@]/#/F }" "${SKIPPED[@]/#/S }" "${NOTES[@]/#/N }"
}
api() { gh api "$@" 2>/dev/null; }          # read: JSON on stdout, nothing on failure
act() { [ "$DRY" = 1 ] && return 0; gh api "$@" >/dev/null 2>&1; }

# ---------- checkout ----------
if [ -z "$DIR" ]; then DIR="${SASORI_CACHE:-$HOME/.cache/sasori}/${REPO/\//__}"; fi
if [ ! -d "$DIR/.git" ]; then
  mkdir -p "$(dirname "$DIR")"
  git clone -q "${SASORI_GIT_URL:-https://github.com/$REPO.git}" "$DIR" || { echo "can't clone $REPO" >&2; exit 1; }
fi
clean_clone() { # dir: session CI runs a commit's code in this clone, and that code could write the clone's git config
  # (core.fsmonitor, a smudge filter with .git/info/attributes, an include) to run on the next git command, the next
  # PR's checkout before its Security, or a gc hook to run at the next fetch. Keep only the settings a clone needs.
  # In the conductor's own cache (the default path) origin is put back too, so later fetches can't come from elsewhere.
  local d=$1 k
  git -C "$d" config --local --name-only --list 2>/dev/null | sort -u | while IFS= read -r k; do
    [[ "$k" =~ ^(core\.(repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|symlinks)|remote\.origin\.(url|fetch|promisor|partialclonefilter)|branch\..+\.(remote|merge)|extensions\.[a-z]+|fetch\.prune)$ ]] && continue
    git -C "$d" config --local --unset-all "$k" 2>/dev/null
  done
  rm -f "$d/.git/info/attributes" "$d/.git/config.worktree" "$d"/.git/worktrees/*/config.worktree 2>/dev/null
  [ "$d" = "${SASORI_CACHE:-$HOME/.cache/sasori}/${REPO/\//__}" ] && git -C "$d" config --local remote.origin.url "${SASORI_GIT_URL:-https://github.com/$REPO.git}"
  return 0
}
clean_clone "$DIR"
g()  { git -C "$DIR" -c core.hooksPath=/dev/null -c core.fsmonitor=false -c gc.auto=0 -c maintenance.auto=false "$@"; }   # session CI runs PR code in this clone
# Merges read the base's .gitattributes (merge=union and co.), never this clone's stale working tree, which may
# have none: else a union merge reads as a hand-resolved conflict. git 2.42 and up; older git, the info/attributes file.
base_attrs() { # every .gitattributes in the base, as one file of root-relative patterns, shallowest first (deeper wins)
  local f d
  g ls-tree -r --name-only "origin/$BASE" 2>/dev/null | grep -E '(^|/)\.gitattributes$' | awk -F/ '{ print NF "\t" $0 }' | sort -n | cut -f2 \
    | while IFS= read -r f; do
        d=$(dirname "$f"); g show "origin/$BASE:$f" 2>/dev/null | awk -v d="$d" '
          /^[[:space:]]*(#|$)/ { next }
          { p = $1; rest = substr($0, index($0, $1) + length($1))
            if (d != ".") { sub(/^\//, "", p); p = (index(p, "/") ? d "/" p : d "/**/" p) }
            print p rest }'
      done
}
gm() {   # SASORI_NO_ATTR_SOURCE=1 takes the older-git path (tests)
  if [ -z "${SASORI_NO_ATTR_SOURCE:-}" ] && git --attr-source=HEAD version >/dev/null 2>&1; then g --attr-source="origin/$BASE" "$@"; return; fi
  # Older git: the base's attributes in info/attributes, and an empty work tree and index, so neither the clone's
  # stale checkout nor a PR's .gitattributes left in it count.
  local e rc=0; e=$(mktemp -d); base_attrs > "$DIR/.git/info/attributes"
  # (-C the clone would still read its own work tree: run from the empty one, with --git-dir)
  (cd "$e" && GIT_INDEX_FILE="$e/index" git --git-dir="$DIR/.git" --work-tree="$e" -c core.hooksPath=/dev/null \
    -c core.fsmonitor=false -c gc.auto=0 -c maintenance.auto=false "$@") || rc=$?
  rm -rf "$e" "$DIR/.git/info/attributes"; return $rc
}
merge_drivers() { base_attrs | grep -qE '(^|[[:space:]])merge=[a-z]'; }   # GitHub's update-branch ignores them
gc() { git -C "$DIR" -c core.hooksPath=/dev/null -c core.fsmonitor=false -c gc.auto=0 -c maintenance.auto=false -c user.name="${SASORI_GIT_NAME:-sasori-train}" -c user.email="${SASORI_GIT_EMAIL:-sasori-train@users.noreply.github.com}" "$@"; }
# The branch the clone was on, put back when the train ends: a session working in this clone and committing on the
# detached HEAD the train leaves would lose its work (Shipping Log). Carried across the restart that reverts.
ORIG_BRANCH=${SASORI_TRAIN_ORIG-$(g symbolic-ref -q --short HEAD 2>/dev/null || true)}
[ "$ORIG_BRANCH" = sasori-restack ] && ORIG_BRANCH=""
restore_branch() { [ -n "$ORIG_BRANCH" ] && g checkout -q "$ORIG_BRANCH" 2>/dev/null; return 0; }
trap restore_branch EXIT
g rebase --abort >/dev/null 2>&1; g checkout -q --detach 2>/dev/null; g branch -q -D sasori-restack 2>/dev/null   # a run killed mid-restack
g fetch -q --prune origin || { echo "can't fetch $REPO" >&2; exit 1; }
[ -n "$BASE" ] || BASE=$(api "repos/$REPO" | jq -r '.default_branch // empty')
BASE=${BASE:-main}
ME=${TRUST:-$(api user | jq -r '.login // empty')}
ME=${ME:-${REPO%%/*}}
ME=$(tr '[:upper:]' '[:lower:]' <<<"$ME")   # logins compare in lower case, as GitHub treats them
rx() { sed 's/[][\.*^$+?(){}|/]/\\&/g' <<<"$1"; }   # a login as a literal in a regex ("sasori-gate[bot]")
fetch_ref() { g fetch -q origin "+refs/heads/$1:refs/remotes/origin/$1" 2>/dev/null; }
del_branch() { [ "$1" = "$BASE" ] || act -X DELETE "repos/$REPO/git/refs/heads/$1"; }

# ---------- the required workflows at a commit: pass | fail | pending | none ----------
BASECFG=$(g show "origin/$BASE:.sasori/config.json" 2>/dev/null); jq -e . >/dev/null 2>&1 <<<"$BASECFG" || BASECFG='{}'
[ -n "$REQUIRE" ] || REQUIRE=$(jq -r '(.workflows // {"CI": "ci.yml"}) | to_entries | map("\(.key)=\(.value)") | join(",")' <<<"$BASECFG")
clean_clone "$DIR"
IFS=',' read -ra REQ <<<"$REQUIRE"
CI_SH="$(cd "$(dirname "$0")" && pwd)/ci.sh"; CIREC="$DIR/.git/sasori-ci"; mkdir -p "$CIREC"
STALE=${SASORI_CI_STALE:-3600}
wf_states() { # sha -> "<name> <state>" (pass, fail, pending or none) from this train's own run there, else the trusted sasori/<name> statuses
  local sts r name own
  sts=$(api "repos/$REPO/commits/$1/statuses?per_page=100" --paginate | jq -cs '[.[][]]'); sts=${sts:-[]}
  for r in "${REQ[@]}"; do
    name=${r%%=*}
    own=$(awk -v n="$name" '$1 == n { print $2 }' "$CIREC/$1" 2>/dev/null | tail -1)
    if [ -n "$own" ]; then echo "$name $own"; continue; fi
    jq -r --arg n "sasori/$name" --arg who "$ME" --argjson stale "$STALE" --arg name "$name" '
      [.[] | select(.context == $n and ((.creator.login // "") | ascii_downcase) == $who)] | sort_by(.created_at) | last
      | if . == null then "none"
        elif .state == "success" then "pass"
        elif .state == "pending" then (if (now - (.created_at | fromdateiso8601)) > $stale then "none" else "pending" end)
        elif .state == "error" then "none"
        else "fail" end | "\($name) \(.)"' <<<"$sts"
  done
}
run_ci() { # sha: session CI there, recorded so this train trusts its own result even when statuses aren't trusted
  local out post=(); [ "$DRY" = 1 ] && post=(--dry-run)
  log "  session CI at ${1:0:7}"
  out=$(SASORI_CI_POST=1 bash "$CI_SH" --repo "$REPO" --sha "$1" --clone "$DIR" --json "${post[@]}" 2>>"$CIREC/log" | tail -1)
  jq -e .results >/dev/null 2>&1 <<<"$out" || { NOTES+=("session CI didn't run at ${1:0:7} (see $CIREC/log)"); return; }
  # Only real results are recorded: an error (a runner that couldn't run, a base with no checks yet) is not red,
  # it's not run, so it runs again next time. To forget a result, delete .git/sasori-ci/<sha> in the train's clone.
  jq -r '.results | to_entries[] | select(.value.state == "success" or .value.state == "failure")
           | "\(.key) \(if .value.state == "success" then "pass" else "fail" end)"' <<<"$out" > "$CIREC/$1"
  [ "$DRY" = 0 ] && [ "$(jq -r '.statusesPosted' <<<"$out")" = false ] \
    && { NOTES+=("couldn't post statuses at ${1:0:7}: this train goes on its own run; the results are in a PR comment"); log "  ${NOTES[-1]}"; }
  return 0
}
checks() {
  local s; s=$(wf_states "$1")
  if grep -q ' fail$' <<<"$s"; then echo fail; elif grep -q ' pending$' <<<"$s"; then echo pending
  elif grep -q ' none$' <<<"$s"; then echo none; else echo pass; fi
}
failing() { wf_states "$1" | awk '$NF == "fail" { $NF=""; print }' | sed 's/ $//' | paste -sd, -; }
dispatch() { # ref [sha]: run session CI there now (with sha: only if a required workflow has no result at it)
  local sha=${2:-}; [ -n "$sha" ] || { fetch_ref "$1"; sha=$(g rev-parse -q --verify "origin/$1"); }
  [ -n "$sha" ] || return 0
  # Captured first: under pipefail, `! wf_states | grep -q` is true when grep's early exit kills wf_states (SIGPIPE),
  # which skipped session CI for good ("CI not finished" forever).
  local st; st=$(wf_states "$sha")
  [ -n "${2:-}" ] && ! grep -q ' none$' <<<"$st" && return 0
  run_ci "$sha"; return 0
}
wait_checks() { # sha ref -> pass | fail | timeout | none
  local start=$SECONDS s kicked=0
  while :; do
    s=$(checks "$1")
    case "$s" in pass|fail) echo "$s"; return ;; esac
    if [ "$s" = none ] && [ "$kicked" = 0 ]; then dispatch "$2" "$1"; kicked=1; continue; fi
    [ "$TIMEOUT" = 0 ] && { echo timeout; return; }
    [ "$s" = none ] && [ $((SECONDS-start)) -ge "$NOCI_GRACE" ] && { echo none; return; }
    [ $((SECONDS-start)) -ge "$TIMEOUT" ] && { echo timeout; return; }
    sleep "$POLL"
  done
}

# ---------- PRs, verdicts, comments ----------
list_prs() {
  local j; j=$(api "repos/$REPO/pulls?state=open&per_page=100" | jq -c '[.[] | {number, title, draft, created_at,
      body: (.body // ""), ref: .head.ref, head: .head.sha, base: .base.ref}]')
  echo "${j:-[]}"
}
comments() { api "repos/$REPO/issues/$1/comments?per_page=100" --paginate | jq -cs '[.[][]]'; }
VRE='^<!-- sasori:verdict (APPROVE|BLOCK) sha=([0-9a-f]{40})( base=([0-9a-f]{40}))?( from=([0-9a-f]{40}) onto=([0-9a-f]{40}))? -->'
verdict_sha() { # pr -> the commit the latest trusted verdict approves, or empty (latest blocks, or none)
  local all latest
  all=$(comments "$1" | jq -r --arg me "$ME" '.[] | (.user.login | ascii_downcase) as $l | select($l == $me)
          | $l + " " + (.body | split("\n")[0])' | grep -E " <!-- sasori:verdict ")
  latest=$(grep -E "^[^ ]+ ${VRE#^}" <<<"$all" | tail -1)
  [[ "$latest" =~ ^([^ ]+)\ ${VRE#^} ]] || return 0
  local word=${BASH_REMATCH[2]} sha=${BASH_REMATCH[3]} from=${BASH_REMATCH[7]} onto=${BASH_REMATCH[8]} seen
  [ "$word" = APPROVE ] || return 0
  if [ -n "$from" ]; then   # a verdict carried across a restack: re-prove it, whoever posted it
    # The reviewer approved the diff from the base it recorded (base=, the merge-base it reviewed against) to $from.
    # The restacked head must add exactly that change to the base branch: no more (a parent commit that was later
    # dropped would be replayed by the rebase) and no less. A verdict with no recorded base can't be carried.
    # Only if the reviewer's latest word on $from is that APPROVE: a later BLOCK at the same commit supersedes it.
    seen=$(grep -E "^$(rx "$ME") <!-- sasori:verdict (APPROVE sha=$from base=[0-9a-f]{40}|BLOCK sha=$from)( |-->)" <<<"$all" | tail -1 \
             | grep -oE "^$(rx "$ME") <!-- sasori:verdict APPROVE sha=$from base=[0-9a-f]{40} -->" | grep -oE 'base=[0-9a-f]{40}' | cut -d= -f2)
    [ -n "$seen" ] || return 0
    g cat-file -e "$sha^{commit}" 2>/dev/null && g cat-file -e "$from^{commit}" 2>/dev/null && g cat-file -e "$seen^{commit}" 2>/dev/null || return 0
    g merge-base --is-ancestor "$seen" "$from" || return 0
    # --verbatim: whitespace counts (a dedent can change what Python runs); line numbers still don't
    [ "$(g diff "$seen" "$from" | git patch-id --verbatim | cut -d' ' -f1)" = \
      "$(g diff "$(g merge-base "$sha" "origin/$BASE")" "$sha" | git patch-id --verbatim | cut -d' ' -f1)" ] || return 0
    # and nobody trusted has since blocked the restacked head itself (for good: only a fresh review clears it)
    ! grep -qE "^$(rx "$ME") <!-- sasori:verdict BLOCK sha=$sha -->" <<<"$all" || return 0
  fi
  echo "$sha"
}
verdict_covers() { # verdictSha headSha: on top of the verdict, the head adds only clean merges from the base.
  # WHY says what failed, for the skip line.
  WHY="no APPROVE verdict"; [ -n "$1" ] || return 1
  WHY="the verdict's commit ${1:0:7} isn't in the repo"; g cat-file -e "$1^{commit}" 2>/dev/null || return 1
  WHY="the head doesn't contain the approved ${1:0:7}"; g merge-base --is-ancestor "$1" "$2" || return 1
  WHY="the head adds commits after the approved ${1:0:7}"; [ -z "$(g rev-list --no-merges "$2" "^$1" "^origin/$BASE")" ] || return 1
  local m
  for m in $(g rev-list --merges "$2" "^$1"); do      # a conflict resolved by hand is new code: it needs a review
    [ "$(gm merge-tree --write-tree "$m^1" "$m^2" 2>/dev/null | head -1)" = "$(g rev-parse "$m^{tree}")" ] && continue
    WHY="merge ${m:0:7} isn't a clean merge of $BASE (a hand-resolved conflict needs a review)"; return 1
  done
}
said() { comments "$1" | jq -e --arg m "<!-- sasori:$2 sha=$3" 'any(.[]; .body | startswith($m))' >/dev/null; }
comment() { # pr marker-with-args text
  local f; f=$(mktemp); printf '<!-- sasori:%s -->\n%s\n' "$2" "$3" > "$f"
  act -X POST "repos/$REPO/issues/$1/comments" -F body=@"$f"; rm -f "$f"
}
eject() { # pr marker sha reason. Once per head: the head can't merge, and a fix needs a new verdict anyway
  log "  eject #$1: $4"; FAILED+=("#$1 $4")
  said "$1" "$2" "$3" || comment "$1" "$2 sha=$3" "Merge train: $4. Fix it on the same branch, get CI green, and run the review gate again."
}
fixed_issues() { grep -oiE '^[[:space:]]*(close[sd]?|fix(e[sd])?|resolve[sd]?):?[[:space:]]+#[0-9]+' <<<"$1" | grep -oE '[0-9]+$' | sort -u; }
close_issues() { # GitHub only closes them itself for PRs that targeted the base all along
  local n; for n in $(fixed_issues "$1"); do act -X PATCH "repos/$REPO/issues/$n" -f state=closed -f state_reason=completed; done
}
reopen_for_revert() { # sha: reopen what the PR behind this merge fixed, so a new track redoes it
  local pr body n
  pr=$(api "repos/$REPO/commits/$1/pulls" | jq -r '.[0].number // empty'); [ -n "$pr" ] || return 0
  body=$(api "repos/$REPO/pulls/$pr" | jq -r '.body // ""')
  for n in $(fixed_issues "$body"); do
    act -X PATCH "repos/$REPO/issues/$n" -f state=open
    act -X POST "repos/$REPO/issues/$n/labels" -f "labels[]=ready-for-agent"
    comment "$n" "reverted sha=$1" "PR #$pr was reverted because main went red at ${1:0:7}. Reopened for a new track: the failing checks are on that commit."
    NOTES+=("reopened #$n after reverting #$pr")
  done
}

# ---------- the base must be green ----------
recheck() { # sha -> RS, its state, after one more session CI run there if it was red: a flake isn't a root cause, so a
  # red base halts or reverts only when it fails twice on the same commit (Streakplate: a Google Fonts fetch failed)
  RS=$(checks "$1")   # set, not echoed: run_ci's notes and log must reach this shell
  if [ "$RS" = fail ] && [ "$DRY" = 0 ] && [ ! -e "$CIREC/$1.rerun" ]; then
    log "  $BASE red at ${1:0:7} ($(failing "$1")): running it once more on the same commit"
    : > "$CIREC/$1.rerun"; rm -f "$CIREC/$1"; run_ci "$1"; RS=$(checks "$1")
    grep -q ' fail$' "$CIREC/$1" 2>/dev/null && echo ran > "$CIREC/$1.rerun"   # this train's own re-run failed it
  fi
  return 0
}
base_sha=$(g rev-parse "origin/$BASE")
base_state=$(checks "$base_sha")
[ "$base_state" = none ] && dispatch "$BASE" "$base_sha"
recheck "$base_sha"; base_state=$RS
if [ "$base_state" = fail ]; then
  log "HALT $BASE is red at ${base_sha:0:7} ($(failing "$base_sha")). Nothing merges until it's green."
  # Fix forward: a PR whose body says "Sasori-Fixes-Base: <sha>" for this red commit may merge while halted, if it
  # is approved, green, contains the current base (so what merges is what was tested), and targets the base.
  # This is how a red first commit (nothing to revert to) or a red main with a known fix gets green again.
  if [ "$DRY" = 0 ]; then
    PRS=$(list_prs)
    for fn in $(jq -r --arg s "$base_sha" '.[] | select(.draft | not) | select(.body | test("Sasori-Fixes-Base: *[0-9a-f]{7,40}"))
                  | select(. as $p | $s | startswith($p.body | capture("Sasori-Fixes-Base: *(?<x>[0-9a-f]{7,40})").x)) | .number' <<<"$PRS"); do
      fpr=$(jq -c --argjson n "$fn" '.[] | select(.number == $n)' <<<"$PRS")
      fref=$(jq -r .ref <<<"$fpr"); fhead=$(jq -r .head <<<"$fpr"); fbody=$(jq -r .body <<<"$fpr")
      [ "$(jq -r .base <<<"$fpr")" = "$BASE" ] || continue
      fetch_ref "$fref"
      if ! verdict_covers "$(verdict_sha "$fn")" "$fhead"; then log "  fix-forward #$fn: no verdict covers ${fhead:0:7}"; continue; fi
      if ! g merge-base --is-ancestor "$base_sha" "$fhead"; then log "  fix-forward #$fn: doesn't contain ${base_sha:0:7} yet"; continue; fi
      [ "$(checks "$fhead")" = none ] && dispatch "$fref" "$fhead"   # session CI there now, so it can merge this run
      case "$(checks "$fhead")" in
        pass) if act -X PUT "repos/$REPO/pulls/$fn/merge" -f merge_method="$METHOD" -f sha="$fhead"; then
                MERGED+=("#$fn fix-forward for ${base_sha:0:7}"); log "  merged fix-forward #$fn"; dispatch "$BASE"; close_issues "$fbody"; del_branch "$fref"
                finish false ""; exit 0
              else log "  GitHub refused to merge fix-forward #$fn"; fi ;;
        none) log "  fix-forward #$fn: its CI didn't run at ${fhead:0:7}" ;;
        *) log "  fix-forward #$fn: CI $(checks "$fhead") at ${fhead:0:7}" ;;
      esac
    done
  fi
  if [ "$REVERT" = 1 ] && [ "$DRY" = 0 ]; then
    PRS=$(list_prs)
    rv=$(jq -c --arg s "$base_sha" '[.[] | select(.body | contains("Sasori-Revert: " + $s))] | first // empty' <<<"$PRS")
    parent=$(g rev-parse -q --verify "$base_sha^1" 2>/dev/null)
    if [ -n "$rv" ]; then
      rn=$(jq -r .number <<<"$rv"); rref=$(jq -r .ref <<<"$rv"); rhead=$(jq -r .head <<<"$rv")
      fetch_ref "$rref"
      if ! g diff --quiet "$parent" "$rhead" 2>/dev/null; then
        log "  revert #$rn isn't an exact revert any more; leaving it for the conductor"
      else
        [ "$(checks "$rhead")" = none ] && dispatch "$rref" "$rhead"
        case "$(checks "$rhead")" in
          pass) if act -X PUT "repos/$REPO/pulls/$rn/merge" -f merge_method=squash -f sha="$rhead"; then
                  MERGED+=("#$rn revert of ${base_sha:0:7}"); log "  merged revert #$rn"; dispatch "$BASE"; del_branch "$rref"
                  reopen_for_revert "$base_sha"
                else log "  GitHub refused to merge revert #$rn"; fi ;;
          fail) log "  revert #$rn is red too, so the failure may not come from ${base_sha:0:7}. Leaving it for the conductor." ;;
          none) log "  revert #$rn: its CI didn't run at ${rhead:0:7}" ;;
          *)    log "  revert #$rn: CI not finished" ;;
        esac
      fi
    elif [ -n "$parent" ] && [ "$(checks "$parent")" = pass ]; then
      br="sasori/revert-${base_sha:0:7}"; mflag=()
      [ "$(g rev-list --parents -n1 "$base_sha" | wc -w)" -gt 2 ] && mflag=(-m 1)
      if g checkout -q -B "$br" "$base_sha" && gc revert --no-edit "${mflag[@]}" "$base_sha" >/dev/null 2>&1 && g push -q -f origin "$br" 2>/dev/null; then
        f=$(mktemp)
        printf 'The base turned red at %s (%s)%s. This puts it back to the last green commit, %s.\n\nSasori-Revert: %s\nSasori-Priority: 0\n' \
          "${base_sha:0:7}" "$(failing "$base_sha")" "$(if [ -s "$CIREC/$base_sha.rerun" ]; then echo ", and failed again when run once more on the same commit"; elif [ -e "$CIREC/$base_sha.rerun" ]; then echo "; running it once more on the same commit gave no result of its own, so this goes on the earlier one"; fi)" \
          "${parent:0:7}" "$base_sha" > "$f"
        if act -X POST "repos/$REPO/pulls" -f title="Revert \"$(g log -1 --format=%s "$base_sha")\"" -f head="$br" -f base="$BASE" -F body=@"$f"; then
          log "  opened a revert of ${base_sha:0:7}"; dispatch "$br"
        else
          log "  couldn't open the revert PR"; NOTES+=("couldn't open a revert PR of ${base_sha:0:7}")
        fi
        rm -f "$f"
      else log "  couldn't build the revert of ${base_sha:0:7}"; fi
      g checkout -q --detach 2>/dev/null
    else
      log "  the commit before was red or unknown, so the culprit isn't clear. The conductor bisects."
    fi
  fi
  finish true "$base_sha"; exit 3
fi

# ---------- candidates in train order; passes repeat while something merges, so restacked children go too ----------
done_prs=" "
for pass in 1 2 3 4 5 6 7 8; do
merged_now=0
PRS=$(list_prs)
ORDER=$(jq -r --arg b "$BASE" '[.[] | select(.base == $b and (.draft | not))
          | . + {prio: ((.body | capture("Sasori-Priority: *(?<p>[0-9]+)").p // "50") | tonumber)}]
          | sort_by(.prio, .created_at) | .[].number' <<<"$PRS")
[ "$pass" = 1 ] && [ -z "$ORDER" ] && log "Nothing is ready to merge in $REPO."

for n in $ORDER; do
  case "$done_prs" in *" $n "*) continue ;; esac; done_prs="$done_prs$n "
  pr=$(jq -c --argjson n "$n" '.[] | select(.number == $n)' <<<"$PRS")
  ref=$(jq -r .ref <<<"$pr"); head=$(jq -r .head <<<"$pr"); body=$(jq -r .body <<<"$pr")
  log "#$n $ref ${head:0:7}"
  g fetch -q origin "$BASE"; fetch_ref "$ref"
  v=$(verdict_sha "$n")
  if ! verdict_covers "$v" "$head"; then
    SKIPPED+=("#$n no review verdict at ${head:0:7}"); log "  skip: no APPROVE verdict covers ${head:0:7} ($WHY)"; continue
  fi

  mb=$(g merge-base "$head" "origin/$BASE")
  # CI the head first, so a green one can take the fast path instead of an update and a second run
  [ "$(checks "$head")" = none ] && dispatch "$ref" "$head"
  if [ "$mb" != "$(g rev-parse "origin/$BASE")" ]; then
    overlap=$(comm -12 <(g diff --name-only "$mb" "origin/$BASE" | sort) <(g diff --name-only "$mb" "$head" | sort))
    if [ "$MODE" = fast ] && [ -z "$overlap" ] && [ "$(checks "$head")" = pass ]; then
      log "  fast path: base moved, no shared files, CI green"
    else
      log "  base moved${overlap:+ (shared: $(head -3 <<<"$overlap" | paste -sd, -))}: updating the branch"
      if [ "$DRY" = 1 ]; then SKIPPED+=("#$n would update and wait"); continue; fi
      if merge_drivers; then   # the base's .gitattributes names merge drivers: merge here with them, and push
        tree=$(gm merge-tree --write-tree "$head" "origin/$BASE" 2>/dev/null) || { eject "$n" train-conflict "$head" "it conflicts with $BASE"; continue; }
        new=$(gc commit-tree "${tree%%$'\n'*}" -p "$head" -p "origin/$BASE" -m "Merge branch '$BASE' into $ref")
        # Only onto the head it merged (the lease): a moved branch, or a ref that isn't this PR's (a fork's
        # branch named like the base), refuses the push
        if [ "$ref" = "$BASE" ] || ! g push -q --force-with-lease="refs/heads/$ref:$head" origin "$new:refs/heads/$ref" 2>/dev/null; then
          SKIPPED+=("#$n head moved at ${head:0:7}"); log "  skip: couldn't push the update (the branch moved)"; continue
        fi
        log "  updated here with the base's merge drivers (${new:0:7})"
      else
        if ! act -X PUT "repos/$REPO/pulls/$n/update-branch" -f expected_head_sha="$head"; then
          eject "$n" train-conflict "$head" "it conflicts with $BASE"; continue
        fi
        new=$head
        for _ in 1 2 3 4 5 6 7 8 9 10; do
          new=$(api "repos/$REPO/pulls/$n" | jq -r '.head.sha // empty'); [ -n "$new" ] && [ "$new" != "$head" ] && break; sleep "$UPDATE_POLL"
        done
      fi
      if [ -z "$new" ] || [ "$new" = "$head" ]; then
        # GitHub updates the branch in the background. Never merge the old head (it wasn't tested with the base) or
        # look up runs for an empty sha: leave it for the next run, which sees the updated head.
        SKIPPED+=("#$n update pending at ${head:0:7}"); log "  skip: GitHub hasn't finished updating the branch"; continue
      fi
      head=$new; fetch_ref "$ref"; dispatch "$ref"
    fi
  fi

  case "$(wait_checks "$head" "$ref")" in
    pass) ;;
    fail) eject "$n" train-failed "$head" "CI failed at ${head:0:7}: $(failing "$head")"; continue ;;
    none) eject "$n" train-failed "$head" "the required workflows ($(sed 's/=[^,]*//g' <<<"$REQUIRE")) didn't run at ${head:0:7}"; continue ;;
    timeout) SKIPPED+=("#$n CI not finished at ${head:0:7}"); log "  skip: CI not finished at ${head:0:7}"; continue ;;
  esac
  if [ "$DRY" = 1 ]; then SKIPPED+=("#$n would merge"); log "  would merge"; continue; fi

  kids=$(jq -r --arg r "$ref" '.[] | select(.base == $r) | "\(.number) \(.ref) \(.head)"' <<<"$PRS")
  if ! out=$(gh api -X PUT "repos/$REPO/pulls/$n/merge" -f merge_method="$METHOD" -f sha="$head" 2>&1); then
    eject "$n" train-conflict "$head" "GitHub refused the merge: $(jq -r '.message // empty' <<<"$out" 2>/dev/null | head -1)"; continue
  fi
  msha=$(api "repos/$REPO/pulls/$n" | jq -r '.merge_commit_sha // ""')
  MERGED+=("#$n ${msha:0:7}"); log "  merged as ${msha:0:7}"
  g fetch -q origin "$BASE"; dispatch "$BASE"; close_issues "$body"
  merged_now=1
  if [ "$DRY" = 0 ]; then   # the base after this merge: red means stop, and revert
    nb=$(g rev-parse "origin/$BASE")
    recheck "$nb"
    if [ "$RS" = fail ]; then
      log "  $BASE is red at ${nb:0:7} after merging #$n ($(failing "$nb"))"
      if [ "$REVERT" = 1 ] && [ -z "${SASORI_TRAIN_AGAIN:-}" ]; then   # once: the halted branch above opens the revert
        log "  starting again to revert it"
        SASORI_TRAIN_AGAIN=1 SASORI_TRAIN_ORIG="$ORIG_BRANCH" SASORI_TRAIN_MERGED="$(printf '%s\n' "${MERGED[@]}")" exec bash "$0" "${ARGS[@]}"
      fi
      finish true "$nb"; exit 3
    fi
  fi

  # Children stacked on this PR now target the base, rebased onto it (squash and rebase rewrite the parent's commits)
  while read -r kn kref khead; do
    [ -n "$kn" ] || continue
    act -X PATCH "repos/$REPO/pulls/$kn" -f base="$BASE"
    [ "$METHOD" = merge ] && { log "  #$kn now targets $BASE"; continue; }
    kv=$(verdict_sha "$kn"); fetch_ref "$kref"
    g checkout -q -B sasori-restack "origin/$kref" 2>/dev/null
    if gc rebase -q --onto "origin/$BASE" "$head" sasori-restack >/dev/null 2>&1; then
      nh=$(g rev-parse sasori-restack)
      if g push -q --force-with-lease="$kref:$khead" origin "sasori-restack:$kref" 2>/dev/null; then
        log "  restacked #$kn onto $BASE (${nh:0:7})"; dispatch "$kref"
        [ -n "$kv" ] && [ "$kv" = "$khead" ] && comment "$kn" "verdict APPROVE sha=$nh from=$khead onto=$head" \
          "Review verdict carried from ${khead:0:7}: the same change, rebased cleanly onto $BASE after its parent #$n merged."
      else
        log "  #$kn: couldn't push the restack (the branch moved?)"
        said "$kn" restack-conflict "$khead" || comment "$kn" "restack-conflict sha=$khead" \
          "Merge train: #$n merged, but pushing this branch rebased onto $BASE failed. Rebase with \`git rebase --onto origin/$BASE ${head:0:12}\`, then push."
      fi
    else
      g rebase --abort >/dev/null 2>&1
      log "  #$kn conflicts after restack"
      said "$kn" restack-conflict "$khead" || comment "$kn" "restack-conflict sha=$khead" \
        "Merge train: #$n merged, and rebasing this branch onto $BASE conflicts. Rebase with \`git rebase --onto origin/$BASE ${head:0:12}\`, then push."
    fi
    g checkout -q --detach 2>/dev/null; g branch -q -D sasori-restack 2>/dev/null
  done <<<"$kids"
  del_branch "$ref"
done
[ "$merged_now" = 1 ] || break
g fetch -q --prune origin
done

finish false ""
exit 0
