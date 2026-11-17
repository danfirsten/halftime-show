#!/bin/bash
# Sasori session CI: runs a commit's required checks in a clean worktree and posts one commit status per required
# workflow (context sasori/<name>), for repos whose .sasori/config.json says "ci": "sessions". No Actions minutes.
#
#   ci.sh --repo owner/name --sha <sha> [--clone <dir>] [--only CI,QA] [--dry-run] [--json]
#
# What runs comes from the base branch's .sasori/config.json, never the commit's own, so a PR can't switch a check
# off for itself. The exception is the switch to session CI: when the base has no config, or one not in sessions
# mode, the commit's own config applies (the review gate approved that exact head), and every status says so:
#   CI (or any name without a runner below)  "checks", one command after another, after installing dependencies
#   QA (sasori-qa.yml)                       build, start, and .claude/sasori/qa/shoot.mjs with motion; the QA comment
#   Security (sasori-security.yml)           gitleaks over the commit's own commits; the dependency audit
#                                            (.claude/sasori/audit.sh, with the "audit" config) when a manifest changed
#   "ciRun": {"<name>": ["cmd", ...]}        commands of your own for a workflow, overriding the above. They see
#                                            SASORI_BASE_SHA (the merge-base, for comparing with the base) and
#                                            SASORI_QA_OUT: a QA report written there (report.json, report.md and
#                                            the pictures, as shoot.mjs writes them) gets the QA comment
# Security runs first, before any of the commit's own code (installing runs its scripts), and its status is posted
# at once; the rest run one after another (they may share a build folder). An error (a runner that couldn't run)
# is not a failure: the train treats it as not run.
#
# What this can't do: CI and QA run the commit's own code, as the conductor, so their statuses are only as honest as
# that code; a hostile change could post a status of its own. The review gate reads the code for that.
#
# Statuses carry verdict-level trust: the train merges on them. Only the conductor posts them (its train, and
# `sasori ci` from the factory), so posting needs SASORI_CI_POST=1; the code under test never sees it. Everyone
# else runs --dry-run: the same checks, nothing posted. Exit 0 all passed, 1 something failed or errored, 2 usage.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO=""; SHA=""; CLONE=""; ONLY=""; DRY=0; JSON=0
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO=$2; shift ;; --sha) SHA=$2; shift ;; --clone) CLONE=$2; shift ;; --only) ONLY=$2; shift ;;
    --dry-run) DRY=1 ;; --json) JSON=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "ci.sh: unknown argument $1" >&2; exit 2 ;;
  esac; shift
done
[ -n "$REPO" ] && [ -n "$SHA" ] || { echo "usage: ci.sh --repo owner/name --sha <sha> [--dry-run]" >&2; exit 2; }
if [ "$DRY" = 0 ] && [ "${SASORI_CI_POST:-}" != 1 ]; then
  echo "ci.sh: posting statuses is for the train, the conductor and the review gate (SASORI_CI_POST=1). Use --dry-run." >&2; exit 2
fi
say() { if [ "$JSON" = 1 ]; then echo "$*" >&2; else echo "$*"; fi; }

# ---------- a clean worktree at the commit ----------
CLONE=${CLONE:-${SASORI_CACHE:-$HOME/.cache/sasori}/${REPO/\//__}}
if [ ! -d "$CLONE/.git" ]; then
  mkdir -p "$(dirname "$CLONE")"
  git clone -q "${SASORI_GIT_URL:-https://github.com/$REPO.git}" "$CLONE" || { echo "ci.sh: can't clone $REPO" >&2; exit 2; }
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
clean_clone "$CLONE"; mkdir -p "$CLONE/.git/sasori-ci"   # the mark: the train cleans it too
c() { git -C "$CLONE" -c core.hooksPath=/dev/null -c core.fsmonitor=false -c gc.auto=0 -c maintenance.auto=false "$@"; }   # never a hook, monitor or gc a commit planted
c fetch -q origin 2>/dev/null
c cat-file -e "$SHA^{commit}" 2>/dev/null || c fetch -q origin "$SHA" 2>/dev/null
c cat-file -e "$SHA^{commit}" 2>/dev/null || { echo "ci.sh: $SHA isn't in $REPO" >&2; exit 2; }
SHA=$(c rev-parse "$SHA^{commit}")
BASE=$(c symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##'); BASE=${BASE:-main}
T=$(mktemp -d); W="$T/w"; L=$(mktemp -d)   # results live apart from the worktree the commit's code runs in
cleanup() { c worktree remove --force "$W" >/dev/null 2>&1; c worktree prune >/dev/null 2>&1; clean_clone "$CLONE"; rm -rf "$T" "$L"; }   # cleaned again: the code just ran
trap cleanup EXIT
c worktree add -q --detach "$W" "$SHA" 2>/dev/null || { echo "ci.sh: couldn't check out $SHA" >&2; exit 2; }

# ---------- the base's config, never the commit's own (except the switch to session CI) ----------
CFG_FROM=base; CFG_WHY=""
if ! CFG=$(c show "origin/$BASE:.sasori/config.json" 2>/dev/null) || ! jq -e . >/dev/null 2>&1 <<<"$CFG"; then
  CFG_WHY="the base has none"
elif [ "$(jq -r '.ci // "actions"' <<<"$CFG")" != sessions ]; then
  CFG_WHY="the base isn't in session CI yet"   # the switch PR: the base's config was written for Actions
fi
if [ -n "$CFG_WHY" ]; then
  CFG=$(cat "$W/.sasori/config.json" 2>/dev/null || echo '{}'); CFG_FROM=commit
  jq -e . >/dev/null 2>&1 <<<"$CFG" || CFG='{}'
fi
tools() { # the base's QA and audit tools, into a fresh folder each time they're used, so code the commit ran earlier
  # can't have edited them; else (a repo without the kit yet) this script's own: beside it in a project, or the kit
  local d f; d=$(mktemp -d); mkdir -p "$d/qa"
  for f in qa/shoot.mjs qa/motion.mjs audit.sh; do
    c show "origin/$BASE:.claude/sasori/$f" > "$d/$f" 2>/dev/null \
      || cp "$HERE/$f" "$d/$f" 2>/dev/null || cp "$HERE/../kit/$f" "$d/$f" 2>/dev/null || cp "$HERE/../scripts/$f" "$d/$f" 2>/dev/null || true
    [ -s "$d/$f" ] || rm -f "$d/$f"
  done
  echo "$d"
}
mapfile -t NAMES < <(jq -r '(.workflows // {"CI": "ci.yml"}) | to_entries[] | "\(.key)=\(.value)"' <<<"$CFG")
if [ -n "$ONLY" ]; then   # Security always comes along when anything else runs: it gates installing the commit's code
  re="^($(tr ',' '|' <<<"$ONLY"))="
  sel=$(printf '%s\n' "${NAMES[@]}" | grep -E "$re" || true)
  if [ -n "$sel" ] && grep -qvE '=sasori-security\.yml$' <<<"$sel"; then
    sel=$( { printf '%s\n' "${NAMES[@]}" | grep -E '=sasori-security\.yml$'; echo "$sel"; } | awk 'NF && !seen[$0]++')
  fi
  NAMES=(); [ -n "$sel" ] && mapfile -t NAMES <<<"$sel"
fi
[ ${#NAMES[@]} -gt 0 ] || { echo "ci.sh: no required workflows to run" >&2; exit 2; }

STATUS_FAILED=0
status() { # state name description
  [ "$DRY" = 0 ] || return 0
  gh api -X POST "repos/$REPO/statuses/$SHA" -f state="$1" -f context="sasori/$2" -f description="$(cut -c1-139 <<<"$3")" >/dev/null 2>&1 \
    || { echo "ci.sh: couldn't post the $2 status" >&2; STATUS_FAILED=1; }
}
summary_comment() { # when statuses couldn't be posted (some session proxies refuse POST /statuses): the results go on the
  # commit's PR as one comment, updated in place, so people see them; the train merges only on runs it did itself
  local pr f id; pr=$(gh api "repos/$REPO/commits/$SHA/pulls" -q '[.[] | select(.state == "open")][0].number // empty' 2>/dev/null || true)
  [ -n "$pr" ] || return 0
  f=$(mktemp)
  { echo "<!-- sasori:ci -->"
    echo "**Session CI** at ${SHA:0:7}: the statuses couldn't be posted from this session (the proxy refused), so here are the results. The train merges only on CI it ran itself."
    echo; echo "| Workflow | Result | Detail |"; echo "|---|---|---|"
    jq -r 'to_entries[] | "| \(.key) | \(.value.state) | \(.value.description | gsub("\\|"; "\\\\|")) |"' <<<"$out"
  } > "$f"
  id=$(gh api "repos/$REPO/issues/$pr/comments?per_page=100" --paginate -q '.[] | select(.body | startswith("<!-- sasori:ci -->")) | .id' 2>/dev/null | sed -n 1p || true)
  if [ -n "$id" ]; then gh api -X PATCH "repos/$REPO/issues/comments/$id" -F body=@"$f" >/dev/null 2>&1
  else gh api -X POST "repos/$REPO/issues/$pr/comments" -F body=@"$f" >/dev/null 2>&1; fi
  rm -f "$f"
}
finish() { # rc: the summary (and the PR comment when the statuses didn't go), then exit
  [ "$DRY" = 0 ] && [ "$STATUS_FAILED" = 1 ] && summary_comment
  [ "$JSON" = 1 ] && jq -nc --arg sha "$SHA" --argjson r "$out" --argjson posted "$([ "$DRY" = 0 ] && echo true || echo false)" --argjson sp "$([ "$STATUS_FAILED" = 0 ] && echo true || echo false)" '{sha: $sha, posted: $posted, statusesPosted: $sp, results: $r}'
  exit "$1"
}
result() { echo "$2" > "$L/$1.state"; echo "$3" > "$L/$1.desc"; }   # name state description
kind() { # name=file -> custom | qa | security | checks
  local n=${1%%=*} f=${1#*=}
  if jq -e --arg n "$n" '.ciRun[$n] | type == "array"' <<<"$CFG" >/dev/null 2>&1; then echo custom
  elif [ "$f" = sasori-qa.yml ]; then echo qa
  elif [ "$f" = sasori-security.yml ]; then echo security
  else echo checks; fi
}
for nf in "${NAMES[@]}"; do status pending "${nf%%=*}" "running in a session at ${SHA:0:7}"; done

# ---------- the runners ----------
pm_in() { local d=$1 pm=npm; [ -f "$d/pnpm-lock.yaml" ] && pm=pnpm; [ -f "$d/yarn.lock" ] && pm=yarn; { [ -f "$d/bun.lockb" ] || [ -f "$d/bun.lock" ]; } && pm=bun; echo "$pm"; }
install() { # every package.json at the root or one level down (a monorepo's checks cd into theirs)
  local d pm
  for d in "$W" "$W"/*/; do
    d=${d%/}; [ -f "$d/package.json" ] && [ "$(basename "$d")" != node_modules ] || continue
    pm=$(pm_in "$d")
    case "$pm" in
      npm) if [ -f "$d/package-lock.json" ]; then (cd "$d" && npm ci --no-audit --no-fund); else (cd "$d" && npm install --no-audit --no-fund); fi ;;
      pnpm) (cd "$d" && corepack pnpm install --frozen-lockfile) ;;
      yarn) (cd "$d" && if [ -f .yarnrc.yml ]; then corepack yarn install --immutable; else corepack yarn install --frozen-lockfile; fi) ;;
      bun) (cd "$d" && bun install --frozen-lockfile) ;;
    esac || return 1
  done
}
run_cmds() { # name json-array-of-commands [qa-out]
  local n=$1 cmd i=0 mb; mb=$(c merge-base "$SHA" "origin/$BASE" 2>/dev/null || true)
  while IFS= read -r cmd; do
    i=$((i + 1)); echo "\$ $cmd" >> "$L/$n.log"
    if ! (cd "$W" && env -u SASORI_CI_POST SASORI_BASE_SHA="$mb" SASORI_QA_OUT="${3:-}" timeout "${SASORI_CI_TIMEOUT:-1800}" bash -c "$cmd") >> "$L/$n.log" 2>&1; then
      result "$n" failure "failed: $cmd"; return
    fi
  done < <(jq -r '.[]' <<<"$2")
  [ "$i" -gt 0 ] && result "$n" success "$i command$([ $i = 1 ] || echo s) passed" || result "$n" error "no commands: set \"checks\" in .sasori/config.json"
}
free_port() { # a port the OS says is free (a random one can be an ephemeral port another connection holds)
  python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])' 2>/dev/null \
    || echo $(( 20000 + RANDOM % 12000 ))   # below the usual ephemeral range (32768 and up)
}
stop_server() { # pid: the app and everything it started (npm, then sh, then next-server, which pkill -P never reached,
  # so every QA run left a server holding half a gigabyte until a later one couldn't start)
  local p=$1 i
  kill -TERM -- "-$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null
  for i in 1 2 3 4 5 6 7 8 9 10; do kill -0 -- "-$p" 2>/dev/null || return 0; sleep 0.5; done
  kill -KILL -- "-$p" 2>/dev/null; pkill -KILL -P "$p" 2>/dev/null; kill -KILL "$p" 2>/dev/null; return 0
}
serve() { # name route: start the app on a free port, up to twice, until it answers 200 on route (the first public
  # one, so a login redirect can't hold it up); sets port and pid
  local n=$1 route=$2 try end code
  for try in 1 2; do
    port=$(free_port)
    # its own process group (setsid), so stop_server can stop all of it
    (cd "$W" && PORT=$port exec setsid env -u SASORI_CI_POST $pm run start) >> "$L/$n.server.log" 2>&1 & pid=$!
    end=$(( SECONDS + ${SASORI_QA_START_SECONDS:-180} ))   # a real bound: three minutes a start, however slow each answer
    while [ "$SECONDS" -lt "$end" ]; do
      kill -0 "$pid" 2>/dev/null || break                  # it stopped (a port clash, a crash): start it again
      code=$(curl -s -o /dev/null -L --max-time 10 -w '%{http_code}' "http://localhost:$port$route" 2>/dev/null || true)
      [ "$code" = 200 ] && return 0
      sleep 2
    done
    echo "the app wasn't ready on port $port (try $try, last answer ${code:-none})"
    stop_server "$pid"
  done
  return 1
}
qa() { # name
  local n=$1 pm port pid rc=0 first
  { [ -f "$W/.sasori/qa.json" ] || compgen -G "$W/.sasori/qa.d/*.json" >/dev/null; } || { result "$n" error "no .sasori/qa.json (or qa.d/) to photograph"; return; }
  pm=$(pm_in "$W")
  local f; for f in "$W"/.sasori/qa.json "$W"/.sasori/qa.d/*.json; do   # a union merge can leave a JSON list without its comma
    [ -f "$f" ] && ! jq -e . "$f" >/dev/null 2>&1 && { result "$n" failure "${f#"$W"/} isn't valid JSON (a merge=union merge?)"; return; }
  done
  first=$(cd "$W" && jq -rs '(map(.public // []) | add | .[0]) // (map(.routes // []) | add | .[0]) // "/"' $(ls .sasori/qa.json 2>/dev/null) $(ls .sasori/qa.d/*.json 2>/dev/null | sort) 2>/dev/null || echo /)
  {
    (cd "$W" && env -u SASORI_CI_POST $pm run build) || { result "$n" failure "the build failed"; return; }
    (cd "$W" && { jq -e '.scripts["db:seed"]' package.json >/dev/null && env -u SASORI_CI_POST $pm run db:seed || true; })
    # Shoot only an app that answers: an unready server would read as every page failing. Not ready after two
    # starts is an error (not run, so it runs again), never a red QA.
    serve "$n" "${first:-/}" || { result "$n" error "the app didn't answer 200 on ${first:-/} (see the server log)"; return; }
    # axe-core for the accessibility check: SASORI_QA_DEPS if set, else a pinned copy in the cache, installed apart from
    # the commit's worktree (--ignore-scripts, so nothing runs). Without it the shooter errors rather than passing.
    local qd=${SASORI_QA_DEPS:-${SASORI_CACHE:-$HOME/.cache/sasori}/qa-deps}
    [ -f "$qd/node_modules/axe-core/axe.min.js" ] || (mkdir -p "$qd" && cd "$qd" && npm install --no-save --no-audit --no-fund --ignore-scripts --prefix "$qd" "axe-core@${SASORI_AXE_VERSION:-4.10.3}") >/dev/null 2>&1
    deps=("NODE_PATH=$qd/node_modules" SASORI_QA_NEED_AXE=1)
    tq=$(tools)
    (cd "$W" && env -u SASORI_CI_POST "${deps[@]}" node "$tq/qa/shoot.mjs" --base-url "http://localhost:$port" --out "$L/qa") || rc=$?
    rm -rf "$tq"
    stop_server "$pid"
  } >> "$L/$n.log" 2>&1
  if [ "$rc" = 3 ]; then result "$n" error "axe-core couldn't be installed, so accessibility wasn't checked (not run)"; return; fi
  if [ ! -f "$L/qa/report.json" ]; then result "$n" error "the shooter didn't run (playwright and axe-core installed?)"; return; fi
  if [ "$rc" = 0 ]; then result "$n" success "$(jq -r '"\(.screenshots | length) screenshots, all checks passed"' "$L/qa/report.json")"
  else result "$n" failure "$(jq -r '"\(.failures | length) QA failures"' "$L/qa/report.json")"; fi
  qa_comment "$L/qa" "$n"
}
qa_comment() { # qa-dir name: the PR's QA comment and pictures
  local pr; [ "$DRY" = 0 ] && [ -f "$1/report.json" ] && [ -f "$1/report.md" ] || return 0
  pr=$(gh api "repos/$REPO/commits/$SHA/pulls" -q '[.[] | select(.state == "open")][0].number // empty' 2>/dev/null || true)
  [ -n "$pr" ] && QA_REMOTE=${QA_REMOTE:-$(c remote get-url origin)} bash "$HERE/qa-comment.sh" "$1" "$REPO" "$pr" "$SHA" >> "$L/$2.log" 2>&1
  return 0
}
gitleaks_bin() { # gitleaks 8.24.3, checked against its release checksums every time (never whatever is on PATH)
  [ -n "${SASORI_GITLEAKS:-}" ] && { echo "$SASORI_GITLEAKS"; return; }   # tests
  local b="${SASORI_CACHE:-$HOME/.cache/sasori}/bin/gitleaks" tgz
  local BIN_SHA=e18325d568268b6efb6cd0cc721f8bea5667f4cd1c8d03618ab61987f41269ad TGZ_SHA=9991e0b2903da4c8f6122b5c3186448b927a5da4deef1fe45271c3793f4ee29c
  sum() { sha256sum "$1" 2>/dev/null | cut -d' ' -f1; }   # compared as strings: no `| grep -q` under pipefail
  if [ "$(sum "$b")" != "$BIN_SHA" ]; then
    mkdir -p "$(dirname "$b")"; tgz=$(mktemp)
    curl -sfL -o "$tgz" https://github.com/gitleaks/gitleaks/releases/download/v8.24.3/gitleaks_8.24.3_linux_x64.tar.gz \
      && [ "$(sum "$tgz")" = "$TGZ_SHA" ] && tar -xzf "$tgz" -C "$(dirname "$b")" gitleaks 2>/dev/null; rm -f "$tgz"
    [ "$(sum "$b")" = "$BIN_SHA" ] || return 1
  fi
  echo "$b"
}
security() { # name: gitleaks, then the audit when a manifest changed; the audit runs even if gitleaks can't
  local n=$1 gl range mb changed gstate=success gdesc="no secrets in the new commits" ta
  mb=$(c merge-base "$SHA" "origin/$BASE" 2>/dev/null)
  if [ -n "$mb" ] && [ "$mb" != "$SHA" ]; then range="$mb..$SHA"   # a PR head: its own commits
  elif c rev-parse -q --verify "$SHA^" >/dev/null; then range="$SHA^..$SHA"   # a commit on the base: what it added
  else range=""; fi
  if ! gl=$(gitleaks_bin); then gstate=error; gdesc="gitleaks isn't installed and couldn't be downloaded"
  elif ! (cd "$W" && "$gl" git --redact --no-banner ${range:+--log-opts=$range} .) >> "$L/$n.log" 2>&1; then
    gstate=failure; gdesc="gitleaks found a secret"
  fi
  changed=$( [ -n "$range" ] && c diff --name-only "${range/../...}" || echo "(first commit)")
  if grep -qE '(^|/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|uv\.lock|Pipfile\.lock)$|^\.sasori/config\.json$|^\(first commit\)$' <<<"$changed"; then
    echo "$CFG" > "$T/audit-config.json"; ta=$(tools)
    local ar=0; (cd "$W" && env -u SASORI_CI_POST SASORI_AUDIT_CONFIG="$T/audit-config.json" RUNNER_TEMP="$T" bash "$ta/audit.sh") >> "$L/$n.log" 2>&1 || ar=$?
    rm -rf "$ta"
    if [ "$ar" = 2 ]; then   # a tool (pip-audit) couldn't run: not audited, an error (runs again), unless gitleaks failed
      [ "$gstate" = failure ] && { result "$n" failure "$gdesc; the dependency audit couldn't run"; return; }
      result "$n" error "the dependency audit couldn't run (see the log)$([ "$gstate" = success ] || echo "; $gdesc")"; return
    elif [ "$ar" != 0 ]; then
      result "$n" failure "vulnerable production dependencies$([ "$gstate" = success ] || echo "; $gdesc")"; return
    fi
    gdesc="$gdesc; dependencies audited"
  else gdesc="$gdesc; no manifest changed"; fi
  result "$n" "$gstate" "$gdesc"
}

run_one() { # name=file
  local n=${1%%=*}
  case "$(kind "$1")" in
    custom) local q; q=$(mktemp -d)   # a QA report of the repo's own (Spoor's) gets the QA comment too
            run_cmds "$n" "$(jq -c --arg n "$n" '.ciRun[$n]' <<<"$CFG")" "$q"; qa_comment "$q" "$n"; rm -rf "$q" ;;
    qa) qa "$n" ;;
    security) security "$n" ;;
    checks) run_cmds "$n" "$(jq -c '.checks // []' <<<"$CFG")" ;;
  esac
}

# ---------- run: Security first, before any of the commit's own code; then install and the rest ----------
say "ci ${SHA:0:7} in $REPO ($(printf '%s ' "${NAMES[@]%%=*}")) with the $CFG_FROM's config"
rc=0; out='{}'
report() { # name: post its status now and add it to the summary
  local n=$1 s d
  s=$(cat "$L/$n.state" 2>/dev/null || echo error); d=$(cat "$L/$n.desc" 2>/dev/null || echo "didn't finish")
  [ "$CFG_FROM" = commit ] && d="$d (config from the commit: $CFG_WHY)"
  status "$s" "$n" "$d"
  if [ "$s" = success ]; then say "  $n: ok: $d"; else rc=1; say "  $n: $s: $d"; tail -20 "$L/$n.log" 2>/dev/null | sed 's/^/      /' >&2; fi
  out=$(jq -c --arg n "$n" --arg s "$s" --arg d "$d" '.[$n] = {state: $s, description: $d}' <<<"$out")
}
sec=success
for nf in "${NAMES[@]}"; do
  [ "$(kind "$nf")" = security ] || continue
  run_one "$nf"; report "${nf%%=*}"; st=$(cat "$L/${nf%%=*}.state"); [ "$st" = success ] || sec=$st
done
if [ "$sec" != success ]; then   # never install (which runs every package's scripts) what Security didn't pass
  for nf in "${NAMES[@]}"; do
    [ "$(kind "$nf")" = security ] && continue
    result "${nf%%=*}" "$sec" "not run: Security $([ "$sec" = error ] && echo "couldn't run" || echo failed)"; report "${nf%%=*}"
  done
  finish 1
fi
needs_install=0; for nf in "${NAMES[@]}"; do [ "$(kind "$nf")" = security ] || needs_install=1; done
installed=1
if [ "$needs_install" = 1 ]; then (env -u SASORI_CI_POST bash -c "$(declare -f install pm_in); W='$W'; install") > "$L/install.log" 2>&1 || installed=0; fi
for nf in "${NAMES[@]}"; do
  [ "$(kind "$nf")" = security ] && continue
  if [ "$installed" = 0 ]; then result "${nf%%=*}" failure "installing dependencies failed"; cp "$L/install.log" "$L/${nf%%=*}.log"
  else run_one "$nf"; fi
  report "${nf%%=*}"
done
finish $rc
