#!/bin/bash
# Sasori SessionStart hook. In a Claude Code cloud session the environment can carry a stale GH_TOKEN, and with it
# `gh api` fails instead of going through the session's GitHub proxy. Blank it for the rest of the session.
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -n "${GH_TOKEN:-}" ] && ! gh auth status >/dev/null 2>&1; then
  echo 'export GH_TOKEN=' >> "$CLAUDE_ENV_FILE"
  echo "Sasori: blanked a stale GH_TOKEN, so gh api goes through the session's GitHub proxy (REST only; see .claude/sasori/cloud.md)."
fi
exit 0
