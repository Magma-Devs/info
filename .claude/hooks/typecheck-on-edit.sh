#!/bin/bash
# PostToolUse hook: runs typecheck on the edited file's package after Write/Edit
# Reads tool input from stdin, checks which package was affected, runs typecheck

set -euo pipefail

INPUT=$(cat)

# Extract the file path from the tool input
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.file // empty' 2>/dev/null || true)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Determine which package was edited
if [[ "$FILE_PATH" == *"apps/api/"* ]]; then
  FILTER="@info/api"
elif [[ "$FILE_PATH" == *"apps/web/"* ]]; then
  FILTER="@info/web"
elif [[ "$FILE_PATH" == *"packages/shared/"* ]]; then
  FILTER="@info/shared"
else
  exit 0
fi

# Only check .ts/.tsx files
if [[ ! "$FILE_PATH" =~ \.(ts|tsx)$ ]]; then
  exit 0
fi

# Run typecheck and capture output
cd "$CLAUDE_PROJECT_DIR"
OUTPUT=$(pnpm --filter "$FILTER" typecheck 2>&1) || {
  echo "TypeScript errors found after editing $FILE_PATH:"
  echo "$OUTPUT" | grep -E "error TS" | head -10
  echo ""
  echo "Fix these TypeScript errors before continuing."
  exit 1
}

exit 0
