#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:3b}"
OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
STATE_DIR="${HOME}/Library/Application Support/DealRadar"
FEED_WORKTREE="${STATE_DIR}/deals-data-worktree"
mkdir -p "$STATE_DIR"
if ! command -v ollama >/dev/null 2>&1; then
  echo "Install the free Ollama app from https://ollama.com/download"
  exit 1
fi
if ! curl --silent --fail "${OLLAMA_HOST}/api/tags" >/dev/null; then
  echo "Ollama is not running. Open the Ollama app and retry."
  exit 1
fi
if ! ollama list | awk 'NR>1 {print $1}' | grep -Fxq "$OLLAMA_MODEL"; then
  echo "Downloading local model ${OLLAMA_MODEL} (free, several GB)..."
  ollama pull "$OLLAMA_MODEL"
fi
cd "$ROOT"
git fetch origin deals-data
if [ ! -e "$FEED_WORKTREE/.git" ]; then
  git worktree add --detach "$FEED_WORKTREE" origin/deals-data
fi
git -C "$FEED_WORKTREE" fetch origin deals-data
git -C "$FEED_WORKTREE" reset --hard origin/deals-data
mkdir -p "$FEED_WORKTREE/data"
echo "Running Deal Radar with local model: ${OLLAMA_MODEL}"
DEAL_FEED="$FEED_WORKTREE/data/deals.json" \
DEAL_DB="$STATE_DIR/state.db" \
OLLAMA_HOST="$OLLAMA_HOST" \
OLLAMA_MODEL="$OLLAMA_MODEL" \
AI_REVIEW_MAX_PER_QUERY="${AI_REVIEW_MAX_PER_QUERY:-8}" \
python3 "$ROOT/bot.py"
git -C "$FEED_WORKTREE" add data/deals.json
if git -C "$FEED_WORKTREE" diff --cached --quiet; then
  echo "Feed did not change; nothing to publish."
  exit 0
fi
git -C "$FEED_WORKTREE" -c user.name="Deal Radar Local Scanner" \
  -c user.email="deal-radar-local@users.noreply.github.com" \
  commit -m "Update Deal Radar feed (local AI)"
git -C "$FEED_WORKTREE" push origin HEAD:refs/heads/deals-data
echo "Done. Feed published; refresh the website."
