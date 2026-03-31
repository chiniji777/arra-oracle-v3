#!/bin/bash
# Agent Jump — Quick navigate to stuck agent's tmux window
# Usage: bash scripts/agent-jump.sh [agent-name]
#   No args: list stuck agents and pick one
#   With arg: jump directly to that agent

PATTERNS=(
  "Do you want to proceed"
  "Command contains"
  "Tab to amend"
  "How is Claude doing"
  "1: Bad.*2: Fine.*3: Good"
  "❯ 1\. Yes"
)

get_agent_windows() {
  for session in 01-olympus 02-assistant 03-frontend 04-execution 05-qa 06-backend 07-data 08-leadership 09-debug; do
    tmux list-windows -t "$session" -F "#{session_name}:#{window_name}" 2>/dev/null
  done
}

find_stuck_agents() {
  local stuck=()
  while IFS= read -r target; do
    [[ -z "$target" ]] && continue
    local window="${target##*:}"
    local agent="${window%-oracle}"
    # Skip FirstGod (that's us)
    [[ "$window" == "firstgod-oracle" ]] && continue

    local pane_content
    pane_content=$(tmux capture-pane -t "$target" -p -S -15 2>/dev/null)
    [[ -z "$pane_content" ]] && continue

    for pattern in "${PATTERNS[@]}"; do
      if echo "$pane_content" | grep -qE "$pattern"; then
        local match_line
        match_line=$(echo "$pane_content" | grep -E "$pattern" | head -1 | sed 's/^[[:space:]]*//' | head -c 60)
        stuck+=("$agent	$target	$match_line")
        break
      fi
    done
  done < <(get_agent_windows)
  printf '%s\n' "${stuck[@]}"
}

jump_to_agent() {
  local agent_name="$1"
  local target=""

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local window="${line##*:}"
    local agent="${window%-oracle}"
    if [[ "$agent" == "$agent_name" ]]; then
      target="$line"
      break
    fi
  done < <(get_agent_windows)

  if [[ -z "$target" ]]; then
    echo "Agent '$agent_name' not found"
    exit 1
  fi

  local session="${target%%:*}"
  local window="${target##*:}"

  echo "Jumping to $agent_name → $target"
  tmux select-window -t "$target" 2>/dev/null
  tmux switch-client -t "$session" 2>/dev/null
}

# Auto-approve: send "y" or "1" to stuck agent
approve_agent() {
  local agent_name="$1"
  local target=""

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local window="${line##*:}"
    local agent="${window%-oracle}"
    if [[ "$agent" == "$agent_name" ]]; then
      target="$line"
      break
    fi
  done < <(get_agent_windows)

  if [[ -z "$target" ]]; then
    echo "Agent '$agent_name' not found"
    exit 1
  fi

  # Check what kind of prompt
  local pane_content
  pane_content=$(tmux capture-pane -t "$target" -p -S -15 2>/dev/null)

  if echo "$pane_content" | grep -qE "❯ 1\. Yes"; then
    echo "Sending '1' (Yes) to $agent_name..."
    tmux send-keys -t "$target" "1" Enter
  elif echo "$pane_content" | grep -qE "Do you want to proceed"; then
    echo "Sending 'y' to $agent_name..."
    tmux send-keys -t "$target" "y" Enter
  elif echo "$pane_content" | grep -qE "How is Claude doing"; then
    echo "Dismissing survey for $agent_name..."
    tmux send-keys -t "$target" "0" Enter
  else
    echo "No recognized prompt for $agent_name — jumping instead"
    jump_to_agent "$agent_name"
    exit 0
  fi
  echo "✅ Done"
}

case "${1:-list}" in
  list)
    echo "Scanning for stuck agents..."
    echo ""
    stuck_list=$(find_stuck_agents)
    if [[ -z "$stuck_list" ]]; then
      echo "✅ No stuck agents"
      exit 0
    fi

    i=1
    while IFS=$'\t' read -r agent target reason; do
      echo "  $i) 🚨 $agent ($target)"
      echo "     $reason"
      i=$((i + 1))
    done <<< "$stuck_list"

    echo ""
    echo "Commands:"
    echo "  bash scripts/agent-jump.sh jump <name>    — switch to agent's tmux"
    echo "  bash scripts/agent-jump.sh approve <name> — auto-approve prompt"
    echo "  bash scripts/agent-jump.sh approve-all    — approve all stuck agents"
    ;;

  jump)
    if [[ -z "$2" ]]; then
      echo "Usage: bash scripts/agent-jump.sh jump <agent-name>"
      exit 1
    fi
    jump_to_agent "$2"
    ;;

  approve)
    if [[ -z "$2" ]]; then
      echo "Usage: bash scripts/agent-jump.sh approve <agent-name>"
      exit 1
    fi
    approve_agent "$2"
    ;;

  approve-all)
    echo "Approving all stuck agents..."
    stuck_list=$(find_stuck_agents)
    if [[ -z "$stuck_list" ]]; then
      echo "✅ No stuck agents"
      exit 0
    fi
    while IFS=$'\t' read -r agent target reason; do
      approve_agent "$agent"
    done <<< "$stuck_list"
    ;;

  *)
    # Treat as agent name for quick jump
    jump_to_agent "$1"
    ;;
esac
