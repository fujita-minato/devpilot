#!/bin/bash
# notification hook — 每次 Claude Code 状态变化时写入 live 状态文件
# 加到 ~/.claude/settings.json hooks.notification

HOOK_DATA=$(cat)
PARENT_PID=$PPID
LIVE_DIR="$HOME/.devpilot/live"
mkdir -p "$LIVE_DIR"

SESSION_ID=$(echo "$HOOK_DATA" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")
PROJECT=$(echo "$HOOK_DATA" | jq -r '.cwd // "unknown"' 2>/dev/null || echo "unknown")
PROJECT_NAME=$(basename "$PROJECT")
STATUS=$(echo "$HOOK_DATA" | jq -r '.type // "unknown"' 2>/dev/null || echo "unknown")
TOOL=$(echo "$HOOK_DATA" | jq -r '.tool_name // ""' 2>/dev/null || echo "")
FILE=$(echo "$HOOK_DATA" | jq -r '.file_path // ""' 2>/dev/null || echo "")
BRANCH=$(cd "$PROJECT" 2>/dev/null && git branch --show-current 2>/dev/null || echo "")

cat > "$LIVE_DIR/$PARENT_PID.json" << EOF
{
  "pid": $PARENT_PID,
  "status": "$STATUS",
  "project": "$PROJECT",
  "projectName": "$PROJECT_NAME",
  "branch": "$BRANCH",
  "sessionId": "$SESSION_ID",
  "lastTool": "$TOOL",
  "lastFile": "$FILE",
  "updatedAt": $(date +%s000)
}
EOF
