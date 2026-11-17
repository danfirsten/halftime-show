#!/bin/bash
# audit.sh: the Sasori dependency audit, run by the Security workflow (when a PR or push changes a manifest or
# lockfile) and the nightly audit. From the repo root.
#
# Every directory with a lockfile, not just the root (a repo with spoor/ and web/ has two), and never node_modules.
# Production dependencies only. One failing directory doesn't stop the others being audited. .sasori/config.json
# can tune it (absent or unreadable: strict, high):
#   "audit": { "level": "high", "advisory": ["spoor"], "ignore": ["PYSEC-2024-1"] }
#   level     the severity that fails: low, moderate, high or critical
#   advisory  directories whose findings are warnings with the full output in the job summary, never a failure
#             (build tooling a framework lists as production, fixable only by a major upgrade); doctor lists them
#   ignore    vulnerability ids pip-audit accepts (--ignore-vuln). pip-audit has no severity data, so any other
#             known Python vulnerability fails
# pip-audit runs through pipx, else uvx, else python3 -m pip_audit, else a temporary venv it's installed into.
# Exit 0 clean, 1 vulnerable, 2 when an audit couldn't run at all (no tool): session CI reads 2 as an error, which the
# train treats as not run, never red.
RUNNER_TEMP=${RUNNER_TEMP:-$(mktemp -d)}; mkdir -p "$RUNNER_TEMP" && RUNNER_TEMP=$(cd "$RUNNER_TEMP" && pwd) || exit 2   # absolute: pip-audit runs from a directory in it
set +e; rc=0; n=0; norun=0
cfg=${SASORI_AUDIT_CONFIG:-.sasori/config.json}   # session CI passes the base branch's config
[ -f "$cfg" ] && jq -e . "$cfg" >/dev/null 2>&1 || cfg=/dev/null
level=$(jq -r '.audit.level // "high"' "$cfg" 2>/dev/null); case "$level" in low|moderate|high|critical) ;; *) level=high ;; esac
mapfile -t advisory < <(jq -r '.audit.advisory // [] | .[] | sub("^\\./"; "") | sub("/$"; "")' "$cfg" 2>/dev/null)
ignore=(); while IFS= read -r v; do [ -n "$v" ] && ignore+=(--ignore-vuln "$v"); done < <(jq -r '.audit.ignore // [] | .[]' "$cfg" 2>/dev/null)
yarn1() { # yarn 1's exit code is a severity bitmask that a crash also sets, so read its JSON summary instead
  local out sum; out=$(npx -y yarn@1 audit --json --groups dependencies 2>/dev/null)
  sum=$(grep '"type":"auditSummary"' <<<"$out" | tail -1)
  [ -n "$sum" ] || { echo "yarn audit gave no summary (it failed to run)"; return 1; }
  jq -r '.data.vulnerabilities | "low \(.low), moderate \(.moderate), high \(.high), critical \(.critical)"' <<<"$sum"
  jq -e --arg l "$level" '.data.vulnerabilities as $v | ["low","moderate","high","critical"] as $s
    | [$s[($s | index($l)):][] | $v[.] // 0] | add == 0' <<<"$sum" >/dev/null
}
pip_audit() { # args: pip-audit by whatever can run it here, on the manifest in the current directory; 127 when nothing can
  # Python puts the current directory first on sys.path for `-m` (pip-audit's own `python -m pip` included, whichever
  # route started it), so a commit's own pip/, pip_audit/ or venv/ package would run in place of the real one. So
  # pip-audit runs from an empty directory, on the manifest's absolute path, with PYTHONSAFEPATH=1 as well (3.11+).
  # Console scripts (pipx, uvx, the venv's pip-audit) don't add their directory.
  local here=$PWD v="$RUNNER_TEMP/pip-audit-venv" a args=()
  for a in "$@"; do case "$a" in requirements.txt) args+=("$here/requirements.txt") ;; .) args+=("$here") ;; *) args+=("$a") ;; esac; done
  # A local-path requirement (-e ., ./pkg, file:) can't be audited without building it, which runs its own code. The
  # file isn't rewritten to drop it (pip joins continued lines and resolves includes from the file's own place, so a
  # filtered copy can hide a pin): any line that looks like one means this directory isn't audited, an error, never green
  if [ -f requirements.txt ] && grep -Eq '^[[:space:]]*(-e|--editable)?[[:space:]=]*(\.|/|file:)|@[[:space:]]*(file:|\.|/)' requirements.txt; then
    echo "requirements.txt names a local path (-e ., ./pkg or file:), which pip-audit would build, running its code, so it isn't audited"
    return 127
  fi
  mkdir -p "$RUNNER_TEMP/pip-audit-cwd"; cd "$RUNNER_TEMP/pip-audit-cwd" || return 127
  export PYTHONSAFEPATH=1
  if command -v pipx >/dev/null 2>&1; then pipx run pip-audit "${args[@]}"
  elif command -v uvx >/dev/null 2>&1; then uvx pip-audit "${args[@]}"
  elif python3 -m pip_audit --version >/dev/null 2>&1; then python3 -m pip_audit "${args[@]}"
  elif [ -x "$v/bin/pip-audit" ] || { python3 -m venv "$v" >/dev/null 2>&1 && "$v/bin/pip" install -q pip-audit >/dev/null 2>&1; }; then
    "$v/bin/pip-audit" "${args[@]}"
  else echo "pip-audit couldn't run: no pipx, uvx or pip_audit module, and no venv to install it in"; return 127; fi
}
audit() { # dir label command...
  local d=$1 label=$2 r rel a soft=0; shift 2; n=$((n + 1)); rel=${d#./}
  for a in "${advisory[@]}"; do [ "$rel" = "$a" ] && soft=1; done
  echo "::group::$d: $label$([ $soft = 1 ] && echo ' (advisory)')"; (cd "$d" && "$@") > "$RUNNER_TEMP/audit.out" 2>&1; r=$?
  cat "$RUNNER_TEMP/audit.out"; echo "::endgroup::"
  [ $r = 0 ] && return 0
  if [ $r = 127 ]; then   # the tool isn't here: not audited, which isn't a finding
    echo "::warning::$d: $label couldn't run, so this directory wasn't audited"; [ $soft = 1 ] || norun=1; return 0
  fi
  if [ $soft = 1 ]; then
    echo "::warning::$d: vulnerable production dependencies ($label), advisory by .sasori/config.json"
    { echo "### $d: $label (advisory, not failing)"; echo; echo '```'; tail -c 60000 "$RUNNER_TEMP/audit.out"; echo '```'; } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  else echo "::error::$d: vulnerable production dependencies ($label)"; rc=1; fi
}
find . \( -name node_modules -o -name .git -o -name .venv \) -prune -o -type f \( -name package-lock.json -o -name pnpm-lock.yaml \
    -o -name yarn.lock -o -name bun.lock -o -name bun.lockb -o -name requirements.txt -o -name pyproject.toml \) -print0 \
  | xargs -0 -r -n1 dirname | sort -u > "$RUNNER_TEMP/lockdirs"   # one per line: a directory name may have spaces
while IFS= read -r d; do
  if [ -f "$d/package-lock.json" ]; then audit "$d" "npm audit" npm audit --audit-level="$level" --omit=dev
  elif [ -f "$d/pnpm-lock.yaml" ]; then audit "$d" "pnpm audit" npx -y pnpm@9 audit --audit-level "$level" --prod
  elif [ -f "$d/yarn.lock" ] && [ -f "$d/.yarnrc.yml" ]; then audit "$d" "yarn npm audit" corepack yarn npm audit --environment production --severity "$level" --recursive
  elif [ -f "$d/yarn.lock" ]; then audit "$d" "yarn audit" yarn1
  elif [ -f "$d/bun.lock" ] || [ -f "$d/bun.lockb" ]; then audit "$d" "bun audit" bun audit --audit-level="$level" --prod; fi
  if [ -f "$d/requirements.txt" ]; then audit "$d" "pip-audit" pip_audit -r requirements.txt "${ignore[@]}"
  elif [ -f "$d/pyproject.toml" ]; then audit "$d" "pip-audit" pip_audit . "${ignore[@]}"; fi
done < "$RUNNER_TEMP/lockdirs"
if [ $n = 0 ]; then echo "No lockfile to audit."; else echo "Audited $n lockfile(s) at $level and above in: $(tr '\n' ' ' < "$RUNNER_TEMP/lockdirs")"; fi
[ $rc = 0 ] && [ $norun = 1 ] && rc=2   # nothing vulnerable found, but something wasn't audited
exit $rc
