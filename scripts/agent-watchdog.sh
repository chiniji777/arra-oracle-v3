#!/bin/bash
# Agent Watchdog — Detect stuck agents and notify via macOS
# Usage: bash scripts/agent-watchdog.sh [start|stop|status|scan]

PIDFILE="/tmp/agent-watchdog.pid"
LOGFILE="/tmp/agent-watchdog.log"
ALERT_CACHE="/tmp/agent-watchdog-alerts"
SCAN_INTERVAL=10
DEDUP_SECONDS=300  # 5 min dedup per agent+pattern

# Stuck patterns to detect (grep -E)
# Patterns that need human action
PATTERNS=(
  "Do you want to proceed"
  "Command contains"
  "Tab to amend"
  "❯ 1\. Yes"
)

# Patterns to auto-dismiss (no human action needed)
AUTO_DISMISS=(
  "How is Claude doing"
  "1: Bad.*2: Fine.*3: Good"
)

# Agent sessions and windows
get_agent_windows() {
  # Get the current tmux pane to exclude ourselves
  local self_pane="${TMUX_PANE:-}"
  for session in 01-olympus 02-assistant 03-frontend 04-execution 05-qa 06-backend 07-data 08-leadership 09-debug; do
    tmux list-windows -t "$session" -F "#{session_name}:#{window_name}" 2>/dev/null
  done
}

# Check if an alert was sent recently (dedup)
is_deduped() {
  local key="$1"
  local cache_file="$ALERT_CACHE/$key"
  if [[ -f "$cache_file" ]]; then
    local last_alert
    last_alert=$(cat "$cache_file")
    local now
    now=$(date +%s)
    if (( now - last_alert < DEDUP_SECONDS )); then
      return 0  # still deduped
    fi
  fi
  return 1  # not deduped, should alert
}

# Mark alert as sent
mark_alert() {
  local key="$1"
  mkdir -p "$ALERT_CACHE"
  date +%s > "$ALERT_CACHE/$key"
}

# Send macOS notification + sound
notify() {
  local agent="$1"
  local pattern="$2"
  local session_window="$3"

  # macOS notification
  osascript -e "display notification \"$pattern\" with title \"🚨 Agent Stuck: $agent\" sound name \"Glass\"" 2>/dev/null

  # Log
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] STUCK: $agent ($session_window) — $pattern" >> "$LOGFILE"
}

# Scan all agents once
scan_once() {
  local found=0
  while IFS= read -r target; do
    [[ -z "$target" ]] && continue
    local session="${target%%:*}"
    local window="${target##*:}"
    local agent="${window%-oracle}"

    # Skip our own session (FirstGod running this script)
    [[ "$window" == "firstgod-oracle" ]] && continue

    # Capture last 15 lines
    local pane_content
    pane_content=$(tmux capture-pane -t "$target" -p -S -15 2>/dev/null)
    [[ -z "$pane_content" ]] && continue

    # Auto-dismiss surveys/feedback (no human action needed)
    for dismiss_pattern in "${AUTO_DISMISS[@]}"; do
      if echo "$pane_content" | grep -qE "$dismiss_pattern"; then
        tmux send-keys -t "$target" "0" Enter 2>/dev/null
        echo "Auto-dismissed survey for $agent"
      fi
    done

    for pattern in "${PATTERNS[@]}"; do
      if echo "$pane_content" | grep -qE "$pattern"; then
        local dedup_key="${agent}_$(echo "$pattern" | tr ' ' '_' | head -c 30)"
        if ! is_deduped "$dedup_key"; then
          # Extract the matching line for context
          local match_line
          match_line=$(echo "$pane_content" | grep -E "$pattern" | head -1 | sed 's/^[[:space:]]*//' | head -c 80)
          notify "$agent" "$match_line" "$target"
          mark_alert "$dedup_key"
          found=1
          echo "🚨 $agent ($target) — $match_line"
        fi
        break  # one alert per agent
      fi
    done
  done < <(get_agent_windows)

  if [[ $found -eq 0 ]]; then
    echo "✅ No stuck agents detected"
  fi
}

# List currently stuck agents (no dedup, just scan)
list_stuck() {
  echo "Scanning all agents..."
  echo ""
  local found=0
  while IFS= read -r target; do
    [[ -z "$target" ]] && continue
    local session="${target%%:*}"
    local window="${target##*:}"
    local agent="${window%-oracle}"

    # Skip our own session
    [[ "$window" == "firstgod-oracle" ]] && continue

    local pane_content
    pane_content=$(tmux capture-pane -t "$target" -p -S -15 2>/dev/null)
    [[ -z "$pane_content" ]] && continue

    for pattern in "${PATTERNS[@]}"; do
      if echo "$pane_content" | grep -qE "$pattern"; then
        local match_line
        match_line=$(echo "$pane_content" | grep -E "$pattern" | head -1 | sed 's/^[[:space:]]*//' | head -c 80)
        echo "🚨 $agent ($target) — $match_line"
        found=1
        break
      fi
    done
  done < <(get_agent_windows)

  if [[ $found -eq 0 ]]; then
    echo "✅ All agents clear — no one is stuck"
  fi
}

# Main loop
run_loop() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Watchdog started (PID $$, interval ${SCAN_INTERVAL}s)" | tee -a "$LOGFILE"
  echo $$ > "$PIDFILE"
  mkdir -p "$ALERT_CACHE"

  trap 'echo "[$(date "+%Y-%m-%d %H:%M:%S")] Watchdog stopped" >> "$LOGFILE"; rm -f "$PIDFILE"; exit 0' SIGTERM SIGINT

  while true; do
    scan_once > /dev/null  # silent in loop mode, alerts go to notification + log
    sleep "$SCAN_INTERVAL"
  done
}

# Commands
case "${1:-start}" in
  start)
    if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "Watchdog already running (PID $(cat "$PIDFILE"))"
      exit 1
    fi
    run_loop &
    disown
    echo "🐕 Watchdog started in background (PID $!)"
    echo "   Scanning ${SCAN_INTERVAL}s intervals"
    echo "   Alerts: macOS notification + sound + $LOGFILE"
    echo "   Stop: bash scripts/agent-watchdog.sh stop"
    ;;
  stop)
    if [[ -f "$PIDFILE" ]]; then
      local_pid=$(cat "$PIDFILE")
      if kill "$local_pid" 2>/dev/null; then
        echo "🛑 Watchdog stopped (PID $local_pid)"
        rm -f "$PIDFILE"
      else
        echo "Watchdog not running (stale PID)"
        rm -f "$PIDFILE"
      fi
    else
      echo "Watchdog not running"
    fi
    ;;
  status)
    if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "🐕 Watchdog running (PID $(cat "$PIDFILE"))"
      echo "   Last 5 alerts:"
      tail -5 "$LOGFILE" 2>/dev/null || echo "   (no alerts yet)"
    else
      echo "🛑 Watchdog not running"
    fi
    ;;
  scan)
    scan_once
    ;;
  list)
    list_stuck
    ;;
  *)
    echo "Usage: bash scripts/agent-watchdog.sh [start|stop|status|scan|list]"
    ;;
esac
