---
name: watchdog
description: "Monitor fleet for stuck agents — start/stop watchdog, scan, list stuck, approve prompts"
user_invocable: true
---

# /watchdog — Agent Stuck Detector

Monitor all Oracle fleet tmux sessions for agents stuck on permission prompts, surveys, or other interactive inputs. Sends macOS notifications with sound when stuck agents are detected.

## Commands

Parse the user's argument to determine the action:

- `/watchdog` or `/watchdog start` — Start the background watchdog (scans every 10s)
- `/watchdog stop` — Stop the background watchdog
- `/watchdog status` — Show if watchdog is running + recent alerts
- `/watchdog scan` — One-time scan for stuck agents right now
- `/watchdog list` — List all currently stuck agents with details
- `/watchdog approve <name>` — Auto-approve a stuck agent's prompt (send Yes/dismiss)
- `/watchdog approve-all` — Auto-approve ALL stuck agents
- `/watchdog jump <name>` — Jump to stuck agent's tmux window

## Implementation

Run the appropriate command:

```bash
# For start/stop/status/scan/list:
bash scripts/agent-watchdog.sh <action>

# For approve/approve-all/jump:
bash scripts/agent-jump.sh <action> [agent-name]
```

Show the output to the user. For `start`, confirm the PID and explain how notifications work.

For `scan` and `list`, format the output nicely and suggest next actions (approve or jump).
