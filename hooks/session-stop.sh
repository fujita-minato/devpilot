#!/bin/bash
# stop hook — session 结束时清理 live 状态文件 + 通知 devpilot re-ingest
# 加到 ~/.claude/settings.json hooks.stop

HOOK_DATA=$(cat)
PARENT_PID=$PPID
SESSION_ID=$(echo "$HOOK_DATA" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")
PROJECT=$(echo "$HOOK_DATA" | jq -r '.cwd // "unknown"' 2>/dev/null || echo "unknown")

# 清理 live 状态文件
rm -f "$HOME/.devpilot/live/$PARENT_PID.json"

# 通知 devpilot re-ingest（异步，不阻塞 session 结束）
curl -s -X POST http://localhost:3456/api/ingest \
  -H "Content-Type: application/json" \
  -d "{\"projectPath\": \"$PROJECT\", \"sessionId\": \"$SESSION_ID\"}" \
  > /dev/null 2>&1 &
