#!/bin/bash
# Sasori tripwire: PreToolUse hook for Bash. Everything is autonomous except the few things that are
# irreversible, cost money, expose something publicly or leak a secret. Those exit 2 with the reason.
# No passphrase, no approvals. Dan changes this file by hand if he wants a rule gone.
set -uo pipefail
input=$(cat)
tool=$(jq -r '.tool_name // "Bash"' <<<"$input")
case "$tool" in
  mcp__github__merge_pull_request|mcp__github__enable_pr_auto_merge)
    echo "Sasori tripwire: merge through the merge train (merge-train.sh, which the conductor runs), not an MCP merge or auto-merge. The train checks the review verdict, CI and stacks." >&2; exit 2 ;;
  mcp__github__push_files|mcp__github__create_or_update_file|mcp__github__delete_file)
    b=$(jq -r '.tool_input.branch // ""' <<<"$input")
    if [ -z "$b" ] || [[ "$b" =~ ^(refs/heads/)?(main|master)$ ]]; then
      echo "Sasori tripwire: commit to a branch and open a PR; the default branch only changes through the merge train." >&2; exit 2
    fi
    exit 0 ;;
  mcp__*) exit 0 ;;
esac
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
cwd=$(jq -r '.cwd // "."' <<<"$input")
[ -n "$cmd" ] || exit 0

deny() { echo "Sasori tripwire: $1" >&2; exit 2; }
# The rules read the command as it runs, one simple command at a time:
# - heredoc bodies are dropped (they are text: a comment or file that quotes a command isn't running it);
# - continuation lines are joined and tabs made spaces, so "gh api \<newline> ..." and "gh<tab>api" are seen as written;
# - then it splits on newlines, ;, && , || and |, and every part of a rule has to match within one of those commands.
body_free=$(awk '
  skip { t = $0; if (dash) sub(/^\t+/, "", t); if (t == delim) skip = 0; next }
  { print
    if (match($0, /(^|[^<])<<-?[ \t]*["'"'"']?[A-Za-z_][A-Za-z0-9_]*["'"'"']?/)) {
      h = substr($0, RSTART, RLENGTH); sub(/^[^<]?<</, "", h); dash = (h ~ /^-/); sub(/^-?[ \t]*/, "", h); gsub(/["'"'"']/, "", h)
      delim = h; skip = 1 } }' <<<"$cmd")
joined=$(sed -e ':a' -e '/\\$/{N;s/\\\n/ /;ba' -e '}' <<<"$body_free" | tr '\t' ' ')
segs=$(tr ';&|' '\n\n\n' <<<"$joined")
has() { grep -qE -- "$1" <<<"$segs"; }
seg() { # every pattern matches one and the same command; a pattern starting with ! must not match it. One awk pass.
  awk 'BEGIN { for (i = 1; i < ARGC; i++) { p[i] = ARGV[i]; delete ARGV[i] }; n = ARGC - 1 }
       { ok = 1
         for (i = 1; i <= n; i++) { q = p[i]; neg = (substr(q, 1, 1) == "!"); if (neg) q = substr(q, 2)
                                    if (($0 ~ q) == neg) { ok = 0; break } }
         if (ok) { found = 1; exit } }
       END { exit !found }' "$@" <<<"$segs"
}
GH='(^|[;&|(`/[:space:]])gh +'   # gh at a command start, also inside $( ), backticks, a subshell or as a full path
SECRET='(AKIA[0-9A-Z]{16}|sk_live_[0-9a-zA-Z]{10,}|sk-ant-[a-zA-Z0-9_-]{20,}|sk-[a-zA-Z0-9]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35})'

# ---------- the default branch only moves through the merge train ----------
check_push() { # dir, then the words after "push"
  local cwd=$1; shift
  local remote="" refs=() force=0 del=0 w dst main=0
  for w in "$@"; do
    case "$w" in
      --mirror) deny "git push --mirror can overwrite every branch." ;;
      --force|-f|--force-with-lease|--force-with-lease=*|--force-if-includes) force=1 ;;
      --delete|-d) del=1 ;;
      -*) ;;
      *) if [ -z "$remote" ]; then remote=$w; else refs+=("$w"); fi ;;
    esac
  done
  if [ ${#refs[@]} = 0 ]; then
    refs=("$(git -C "$cwd" branch --show-current 2>/dev/null)")
  fi
  for w in "${refs[@]}"; do
    [[ "$w" == +* ]] && force=1
    dst=${w#+}; [[ "$dst" == *:* ]] && { [ -z "${dst#*:}" ] && del=1; dst=${dst#*:}; }
    dst=${dst#refs/heads/}
    if [ "$dst" = HEAD ] || [ "$dst" = @ ]; then dst=$(git -C "$cwd" branch --show-current 2>/dev/null); fi
    local def; def=$(git -C "$cwd" symbolic-ref -q --short "refs/remotes/${remote:-origin}/HEAD" 2>/dev/null); def=${def#*/}
    [[ "$dst" =~ ^(main|master)$ ]] || { [ -n "$def" ] && [ "$dst" = "$def" ]; } && main=1
  done
  [ "$main" = 1 ] || return 0
  [ "$del" = 1 ] && deny "deleting the default branch is never automatic."
  [ "$force" = 1 ] && deny "force-pushing the default branch rewrites history everyone builds on."
  # An empty remote is being bootstrapped (launch's first commit): the one direct push allowed. So is the bootstrap
  # on top of the provision workflow's kit seed, while that seed is main's only commit and the push fast-forwards it.
  local heads seed
  heads=$(git -C "$cwd" ls-remote --heads "${remote:-origin}" main master 2>/dev/null)
  [ -n "$heads" ] || return 0
  seed=$(awk 'NR == 1 {print $1}' <<<"$heads")
  if [ "$(grep -c . <<<"$heads")" = 1 ] && git -C "$cwd" cat-file -e "$seed^{commit}" 2>/dev/null \
     && [ "$(git -C "$cwd" rev-list --count "$seed")" = 1 ] && [ "$(git -C "$cwd" log -1 --format=%s "$seed")" = "Sasori: kit seed" ] \
     && [ "$(git -C "$cwd" log -1 --format=%ae "$seed")" = sasori-provision@users.noreply.github.com ] \
     && git -C "$cwd" merge-base --is-ancestor "$seed" HEAD 2>/dev/null; then
    return 0
  fi
  deny "the default branch only changes through a PR and the merge train. Push a branch and open a PR."
}
check_commit() { # dir: scan what this commit (and any git add earlier in the command) would record
  local cwd=$1 files diff bad hit
  if has 'git +([^;&|]* )?add|commit[^;&|]*(-a\b|--all\b|-[a-zA-Z]*a[a-zA-Z]*\b)'; then
    files=$( { git -C "$cwd" diff HEAD --name-only; git -C "$cwd" ls-files --others --exclude-standard; } 2>/dev/null || true)
    diff=$( { git -C "$cwd" diff HEAD; git -C "$cwd" ls-files --others --exclude-standard -z | (cd "$cwd" && xargs -0 -r sed 's/^/+ /'); } 2>/dev/null || true)
  else
    files=$(git -C "$cwd" diff --cached --name-only 2>/dev/null || true)
    diff=$(git -C "$cwd" diff --cached 2>/dev/null || true)
  fi
  bad=$(grep -E '(^|/)(\.env(\.[a-z]+)?|id_(rsa|ed25519)|[^/]*\.(pem|p12|pfx|key))$' <<<"$files" | grep -vE '\.env\.(example|sample|template|test)$' | head -3 || true)
  [ -n "$bad" ] && deny "these look like secret files: $(tr '\n' ' ' <<<"$bad"). Keep them out of git (add to .gitignore) and list the keys in .env.example."
  hit=$(grep -E '^\+[^+]' <<<"$diff" | grep -oE "$SECRET" | head -1 || true)
  [ -n "$hit" ] && deny "the change contains what looks like a live credential (${hit:0:8}...). Move it to an env var and the needs-you ledger."
  return 0
}

# Walk the command segment by segment, following cd and git -C, so checks run in the repo the command acts on.
here=$cwd
resolve() { case "$1" in /*) echo "$1" ;; "~") echo "$HOME" ;; "~/"*) echo "$HOME/${1#\~/}" ;; *) echo "$here/$1" ;; esac; }
while IFS= read -r seg; do
  case "$seg" in *git*|cd\ *|*" cd "*|*"(cd "*) ;; *) continue ;; esac   # only git and cd matter here
  read -ra words <<<"${seg//[(){\}\`]/ }"   # subshells, $( ), { } and backticks
  [ ${#words[@]} -gt 0 ] || continue
  if [ "${words[0]}" = cd ] && [ -n "${words[1]:-}" ]; then here=$(resolve "${words[1]}"); continue; fi
  for i in "${!words[@]}"; do
    [ "${words[$i]}" = git ] || continue
    dir=$here; j=$((i+1))
    while [ $j -lt ${#words[@]} ] && [[ "${words[$j]}" == -* ]]; do
      case "${words[$j]}" in
        -C) dir=$(here=$dir; resolve "${words[$((j+1))]}"); j=$((j+2)) ;;
        -c|--git-dir|--work-tree|--namespace|--exec-path|--config-env) j=$((j+2)) ;;   # these take a value
        *) j=$((j+1)) ;;
      esac
    done
    case "${words[$j]:-}" in
      push) check_push "$dir" "${words[@]:$((j+1))}" ;;
      commit) check_commit "$dir" ;;
    esac
    break
  done
done <<<"$segs"

# ---------- merges go through the train so the default branch stays green ----------
# Any PR number form ($n, ${PR}, 12), auto-merge (REST or the proxy's ccr route), and direct commits through the
# contents API or a ref update on the default branch.
has "$GH"'api .*pulls/[^/[:space:]]+/merge([[:space:]"'"'"'`);?]|$)' && deny "merge with the merge train, not a direct REST merge. The train checks the review verdict, CI and stacks."
has 'pulls/[^/[:space:]]+/(ccr/)?auto_merge|gh +pr +merge.*--auto|enablePullRequestAutoMerge' && deny "auto-merge skips the merge train. Mark the PR ready; the train merges it."
has 'mergePullRequest|createCommitOnBranch|mergeBranch\b' && deny "GraphQL merges and commits skip the merge train. Open a PR; the train merges it."
BRANCH_FIELD='(-f|-F|--field|--raw-field)[ =]*["'"'"']?branch='
MAIN_BRANCH='branch=["'"'"']?(refs/heads/)?(main|master)["'"'"']?([[:space:]`);]|$)'
CONTENTS_WRITE=("$GH"'api ' '/contents/' '(-X|--method)[ =]*(PUT|DELETE)')
if seg "${CONTENTS_WRITE[@]}" "!$BRANCH_FIELD" || seg "${CONTENTS_WRITE[@]}" "$MAIN_BRANCH"; then
  deny "the contents API writes straight to a branch (the default one when none is named). Commit on a feature branch and open a PR."
fi
has "$GH"'api .*((-X|--method)[ =]*(PATCH|DELETE|POST).*git/refs/heads/(main|master)([[:space:]"'"'"'`);]|$)|git/refs/heads/(main|master)([[:space:]"'"'"'`);]|$).*(-X|--method)[ =]*(PATCH|DELETE|POST))' \
  && deny "moving or deleting the default branch's ref skips the merge train."
seg "$GH"'api ' 'repos/[^/[:space:]]+/[^/[:space:]]+/merges([[:space:]"'"'"'`);?]|$)' '!(-X|--method)[ =]*GET' \
  && deny "the merges API merges a branch straight into its base. Open a PR; the train merges it."
has "$GH"'pr +merge' && deny "merge with merge-train.sh (or the merge-train skill), not gh pr merge. The train checks the review verdict, CI and stacks."

# ---------- commit statuses carry verdict-level trust ----------
# In session-CI repos the train merges on sasori/* statuses, so only the conductor posts them: its train and `sasori ci`
# in the factory repo. Everywhere else (a track, its review gate subagent) CI runs with --dry-run and posts nothing.
# The train posts from inside merge-train.sh, which this hook doesn't see; that is the sanctioned path.
if [ ! -f "${CLAUDE_PROJECT_DIR:-$cwd}/sasori/bin/sasori" ]; then
  has 'SASORI_CI_POST=' && deny "posting CI statuses is the conductor's (they carry a verdict's trust). Run .claude/sasori/ci.sh --dry-run to see the checks."
  if seg "$GH"'api ' '/statuses/' '(-X|--method)[ =]*POST|(-f|-F|--field|--raw-field)[ =]*["'"'"']?(state|context)=' \
     || seg 'curl ' '/statuses/'; then
    deny "posting a commit status is the conductor's (statuses carry a verdict's trust). Run .claude/sasori/ci.sh --dry-run to see the checks."
  fi
fi

# ---------- history rewrites ----------
has 'git +filter-(branch|repo)' && deny "rewriting repository history is Dan's call."

# ---------- public exposure, deletion, money ----------
has 'gh +repo +delete' && deny "deleting a repository is Dan's call."
seg "$GH"'api ' '(-X|--method)[ =]*DELETE' '(^|[[:space:]"'"'"'/])repos/[^/[:space:]]+/[^/[:space:]"'"'"']+/?([[:space:]"'"'"'`);]|$)' \
  && deny "deleting a repository is Dan's call."
has 'gh +repo +create.*--public|gh +repo +edit.*--visibility[ =]+public|"private" *: *false|private=false|visibility[ =:"]+public' && deny "making a repository public is Dan's call. Create it private."
has '(^|[;&|[:space:]])(npm|pnpm|yarn|bun) +publish' && deny "publishing a package is public and permanent. Dan's call."
has '(domains?|dns) +(buy|purchase|register)' && deny "buying a domain spends money. Add it to the needs-you ledger."
has 'stripe .*--live|sk_live_[0-9a-zA-Z]{10,}' && deny "live Stripe keys and live-mode commands are Dan's. Use test mode."

exit 0
