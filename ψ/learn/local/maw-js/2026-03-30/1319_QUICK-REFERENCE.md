# maw.js Quick Reference Guide

> **maw** — Multi-Agent Workflow
> Remote tmux orchestra control via SSH | Bun/TypeScript + Web UI
> **Version**: 1.1.0 | **Repo**: Soul-Brews-Studio/maw-js

---

## What is maw.js?

**maw** is a command-line orchestrator for managing multiple Claude Code agents running in tmux sessions (locally or remotely via SSH). It combines:

- **Agent Management**: Wake, sleep, communicate with agents across tmux windows
- **Fleet Control**: Initialize and sync agent fleets, manage worktrees, resolve conflicts
- **Web UI Dashboard**: Visual monitoring, terminal access, live feed, configuration
- **Smart Messaging**: Send commands/messages to agents with auto-wake capabilities
- **Workflow Automation**: Create tasks, manage parked tabs, sync memory between worktrees
- **Multi-Agent Orchestration**: MegaAgent hierarchies, team management, federation status

Core purpose: **Control a tmux-based multi-agent system from the command line or web UI**.

---

## Installation Methods

### Quick Start (No Install)
Run directly without cloning:
```bash
bunx --bun github:Soul-Brews-Studio/maw-js ls
bunx --bun github:Soul-Brews-Studio/maw-js peek neo
bunx --bun github:Soul-Brews-Studio/maw-js hey neo "how are you"
```

### Global Installation
```bash
# Clone via ghq
ghq get Soul-Brews-Studio/maw-js
cd $(ghq root)/github.com/Soul-Brews-Studio/maw-js

# Install dependencies + build office UI
bun install          # postinstall hook runs build:office automatically

# Link globally
bun link

# Now use directly
maw ls
```

### Development Setup
```bash
cd $(ghq root)/github.com/Soul-Brews-Studio/maw-js
bun install

# Start dev servers
bun run dev          # Backend (watch src/) on :3456 + Frontend HMR on :5173

# Stop dev servers
bun run dev:stop
```

### Build & Deploy
```bash
# Build office UI only
bun run build:office

# Build for Cloudflare Workers
bun run build:cf

# Deploy to Cloudflare
bun run deploy:cf

# Full deploy (build + sync fleet + restart)
bun run deploy

# Build 8-bit ASCII UI
bun run build:8bit
```

---

## Configuration

### Config File Location
```
~/.config/maw/maw.config.json
```

Create from template:
```bash
cp maw.config.example.json maw.config.json
# Edit with your settings
```

### Configuration Format

```json
{
  "host": "white.local",
  "port": 3456,
  "ghqRoot": "/home/nat/Code/github.com",
  "oracleUrl": "http://localhost:47779",
  "tmuxSocket": "/tmp/tmux-1000/default",

  "env": {
    "CLAUDE_CODE_OAUTH_TOKEN": "<your-token-here>",
    "CUSTOM_VAR": "value"
  },

  "commands": {
    "default": "claude --dangerously-skip-permissions --continue",
    "*-oracle": "claude --dangerously-skip-permissions --continue",
    "codex-*": "codex --dangerously-auto-approve --search"
  },

  "sessions": {
    "nexus": "01-oracles",
    "hermes": "07-hermes",
    "pulse": "09-pulse",
    "calliope": "10-calliope"
  },

  "pin": 1234
}
```

### Configuration Options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `host` | string | `"white.local"` | SSH target for remote control. Use `"local"` for local tmux |
| `port` | number | `3456` | Web UI port |
| `ghqRoot` | string | required | Root directory of ghq cloned repos (e.g., `/home/user/Code/github.com`) |
| `oracleUrl` | string | optional | Oracle API endpoint (e.g., `http://localhost:47779`) |
| `tmuxSocket` | string | optional | Custom tmux socket path |
| `env` | object | `{}` | Environment variables to pass to spawned agents |
| `commands` | object | see example | Command templates with glob patterns for agent types |
| `sessions` | object | `{}` | Named session mappings (e.g., `"neo": "01-neo"`) |
| `pin` | number | optional | PIN code for web UI security |

### Command Patterns

Use glob patterns in `commands` config to customize how agents launch:

```json
{
  "commands": {
    "default": "claude --dangerously-skip-permissions --continue",
    "*-oracle": "claude --model claude-opus-4-6 --dangerously-skip-permissions",
    "codex-*": "codex --dangerously-auto-approve",
    "research-team": "claude --model claude-opus-4-6 --continue"
  }
}
```

Patterns are matched left-to-right; use `default` as fallback.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAW_HOST` | config.host / `"white.local"` | SSH target (overrides config) |
| `MAW_PORT` | `3456` | Web UI port |
| `MAW_CONFIG_DIR` | `~/.config/maw` | Config directory |
| `MAW_TMUX_SOCKET` | config.tmuxSocket | Custom tmux socket |
| `ORACLE_URL` | config.oracleUrl | Oracle API endpoint |
| `CLAUDE_CODE_OAUTH_TOKEN` | from config.env | Claude Code authentication |

Example:
```bash
export MAW_HOST=192.168.1.5
export MAW_PORT=8080
maw ls
```

---

## CLI Commands & Subcommands

### Session & Agent Management

#### `maw ls` / `maw list`
List all tmux sessions, windows, and panes with status.
```bash
maw ls
```

#### `maw peek [agent]`
Show screen output of an agent (one-line summary if no agent specified).
```bash
maw peek                 # Summary of all agents
maw peek neo             # See neo's screen
maw peek hermes:2        # Specific window in hermes session
```

#### `maw view <agent> [window] [--clean]`
Create/attach to a grouped tmux session for an agent (interactive).
```bash
maw view neo             # Attach to neo's session
maw view neo freelance   # Specific worktree
maw view neo --clean     # Full screen (hide status bar)
maw create-view neo      # Alias for view
maw attach neo           # Alias for view
```

---

### Messaging & Communication

#### `maw hey <agent> <message...>` / `maw send` / `maw tell`
Send a message/command to an agent.
```bash
maw hey neo "how are you"
maw hey hermes /recap
maw hey nova "git status" --force --no-wake
maw send neo "test the build"
maw tell athena "/retrospective"
```

Options:
- `--force` — Send even if agent appears offline
- `--no-wake` — Don't auto-wake agent if sleeping

#### `maw <agent> <message...>` (shorthand)
Abbreviated form of `maw hey`.
```bash
maw neo "status check"
maw hermes /recap
```

#### `maw <agent>` (single arg)
Shorthand for peek: see agent's screen.
```bash
maw neo              # Same as: maw peek neo
```

#### `maw talk-to <agent> <message...>` / `maw talkto` / `maw talk`
Send persistent threaded messages to agents (real-time + logged).
```bash
maw talk-to neo "implement feature X"
maw talk neo "how should we approach this?"
maw talkto hermes "check progress"
```

Option:
- `--force` — Force send

#### `maw key <agent> <key> [key2 key3...]`
Send individual keyboard events to an agent.
```bash
maw key athena Enter           # Press Enter
maw key ra Up Up Enter         # Up arrow twice, then Enter
maw key nova Escape            # Press Escape
maw key hermes S-Tab           # Shift+Tab

# Available keys:
# Up Down Left Right Enter Escape Tab Space BSpace
# C-c C-d C-u C-l C-a C-e C-k C-r S-Tab
```

---

### Agent Lifecycle

#### `maw wake <oracle> [task] [options]`
Wake an agent in a tmux window.

Basic usage:
```bash
maw wake neo                    # Wake main repo
maw wake hermes bitkub         # Wake existing worktree
maw wake neo freelance project # Task + description
```

Create new worktree:
```bash
maw wake neo --new free        # Create worktree named 'free'
maw wake neo --new free "description here"
```

Incubate (clone repo via ghq + create worktree):
```bash
maw wake neo --incubate org/repo
maw wake neo --incubate org/repo --issue 5  # With issue prompt
```

With GitHub issue as prompt:
```bash
maw wake neo --issue 5         # Fetch issue #5 + send as claude -p prompt
maw wake neo --issue 5 --repo org/repo  # From specific repo
```

Resume mode (wake + send /recap):
```bash
maw wake neo --resume
```

#### `maw wake all [options]`
Wake entire agent fleet.
```bash
maw wake all                   # Wake fleet 01-15 + 99 (skip dormant 20+)
maw wake all --all             # Wake ALL agents including dormant
maw wake all --kill            # Kill existing sessions first
maw wake all --resume          # Wake + send /recap to active items
```

#### `maw sleep <oracle> [window]`
Gracefully stop one agent window.
```bash
maw sleep neo                  # Sleep neo-oracle main window
maw sleep neo mawjs            # Sleep neo-mawjs worktree
```

#### `maw auto-sleep [options]`
Sleep idle agents (threshold-based).

Automatic sleep:
```bash
maw auto-sleep                 # Sleep agents idle >5 minutes
maw auto-sleep --dry-run       # Preview without sleeping
```

Watch mode (polling):
```bash
maw auto-sleep --watch         # Continuous watchdog (5m polling)
maw auto-sleep --watch --threshold 10  # 10m idle threshold
maw auto-sleep --watch --interval 120  # Poll every 2m
```

Preserve agents:
```bash
maw auto-sleep --keep a,b      # Never auto-sleep these agents
```

#### `maw stop` / `maw rest`
Stop all fleet sessions.
```bash
maw stop
maw rest   # Alias
```

---

### Fleet Management

#### `maw fleet init`
Scan ghq repos and generate fleet configs.
```bash
maw fleet init     # Scan ghq, create fleet/*.json files
```

#### `maw fleet ls` / `maw fleet` (no args)
List fleet configs with conflict detection.
```bash
maw fleet ls
maw fleet         # Same
```

#### `maw fleet renumber`
Fix numbering conflicts (make sequential).
```bash
maw fleet renumber
```

#### `maw fleet validate`
Check for problems: duplicate IDs, orphaned windows, missing repos.
```bash
maw fleet validate
```

#### `maw fleet sync`
Sync repo `fleet/*.json` → `~/.config/maw/fleet/`.
```bash
maw fleet sync
```

#### `maw fleet sync-windows` / `maw fleet syncwin`
Add unregistered tmux windows to fleet configs.
```bash
maw fleet sync-windows
maw fleet syncwin
```

---

### Workflow & Tasks

#### `maw pulse add "<title>" [options]`
Create GitHub issue + wake oracle.

```bash
maw pulse add "Fix bug in auth" --oracle neo
maw pulse add "Refactor API" --oracle hermes --priority P1 --wt oracle-v2
```

Options:
- `--oracle <name>` — Target agent
- `--priority <level>` — P0, P1, P2 (optional)
- `--wt <repo>` / `--worktree <repo>` — Use specific worktree

#### `maw pulse ls` / `maw pulse list`
Show board table of all tasks/issues.

```bash
maw pulse ls
maw pulse ls --sync      # Update daily thread checkboxes
```

#### `maw pulse cleanup` / `maw pulse clean`
Clean stale/orphan worktrees.

```bash
maw pulse cleanup        # Clean and report
maw pulse cleanup --dry-run  # Preview only
```

#### `maw done <window> [options]`
Auto-save agent work, then clean up.

```bash
maw done neo             # Run /rrr + commit + push + clean
maw done neo --force     # Skip auto-save, kill immediately
maw done neo --dry-run   # Show what would happen
```

---

### Parked Tabs & Resume

#### `maw park [window] [note]`
Park current (or named) tab with context snapshot.

```bash
maw park                 # Park current window
maw park neo-freelance "pending PR review"
```

#### `maw park ls` / `maw park list`
List all parked tabs.

```bash
maw park ls
```

#### `maw resume [tab#/name]`
Resume a parked tab (sends context).

```bash
maw resume               # Latest parked tab
maw resume 5             # Tab by index
maw resume neo-freelance # Tab by name
```

---

### Inbox & Notes

#### `maw inbox`
List recent inbox items.

```bash
maw inbox
```

#### `maw inbox read [N]`
Read Nth item (default: latest).

```bash
maw inbox read           # Read latest
maw inbox read 3         # Read item #3
```

#### `maw inbox write <note>`
Write note to inbox.

```bash
maw inbox write "Remember to test new feature"
```

---

### Tabs & Windows

#### `maw tab` / `maw tabs`
List tabs in current session.

```bash
maw tab
maw tabs
```

#### `maw tab N`
Peek at tab N.

```bash
maw tab 2   # See tab 2 screen
```

#### `maw tab N <message...>`
Send message to tab N.

```bash
maw tab 2 "git pull"
```

#### `maw rename <tab# or name> <new-name>`
Rename tab (auto-prefixes oracle name).

```bash
maw rename 2 "freelance"
maw rename neo "new-feature"
```

---

### Contacts & Collaboration

#### `maw contacts` / `maw contact`
List Oracle contacts.

```bash
maw contacts
maw contact
```

#### `maw contacts add <name> [options]`
Add/update contact.

```bash
maw contacts add neo --maw "neo-oracle-001" --thread "123" --notes "Main oracle"
```

Options:
- `--maw` — Contact's maw session ID
- `--thread` — Discord/communication thread
- `--notes` — Description

#### `maw contacts rm <name>` / `maw contacts remove <name>`
Retire a contact (soft delete).

```bash
maw contacts rm old-agent
```

---

### Team & Organization

#### `maw mega` / `maw mega status`
Show MegaAgent team hierarchy tree.

```bash
maw mega
maw mega status
maw mega ls
maw mega tree
```

#### `maw mega stop` / `maw mega kill`
Kill all active team panes.

```bash
maw mega stop
```

#### `maw federation status` / `maw fed status`
Peer connectivity + agent counts.

```bash
maw federation status
maw fed status
maw fed ls
```

---

### Work Management

#### `maw workon <repo> [task]` / `maw work <repo> [task]`
Open repo in new tmux window + claude.

```bash
maw workon github.com/user/repo
maw workon github.com/user/repo "fix authentication"
maw work myrepo "implement feature"
```

#### `maw assign <issue-url> [--oracle <name>]`
Clone repo + wake oracle with issue as prompt.

```bash
maw assign https://github.com/user/repo/issues/42
maw assign https://github.com/user/repo/issues/42 --oracle neo
```

#### `maw pr [window]`
Create PR from current branch (links issue if branch has issue-N).

```bash
maw pr
maw pr neo-freelance
```

#### `maw reunion [window]`
Sync `ψ/memory/` from worktree → main oracle repo.

```bash
maw reunion
maw reunion neo-freelance
```

---

### Monitoring & Analytics

#### `maw tokens [options]`
Token usage stats (from Claude sessions).

```bash
maw tokens
maw tokens --rebuild     # Recompute from logs
maw tokens --json        # JSON output for API
```

#### `maw log chat [oracle]` / `maw chat [oracle]`
Chat view — grouped conversation bubbles.

```bash
maw log chat
maw log chat neo         # Just neo's chat
maw chat hermes          # Alias
```

#### `maw overview [agents...] [--kill]`
War-room: all oracles in split panes.

```bash
maw overview                    # All agents
maw overview neo hermes         # Specific agents
maw overview --kill             # Tear down overview
```

#### `maw about <oracle>`
Oracle profile — session, worktrees, fleet status.

```bash
maw about neo
maw about hermes
maw info neo                     # Alias
```

#### `maw oracle ls` / `maw oracles` / `maw oracle`
Fleet status (awake/sleeping/worktrees).

```bash
maw oracle ls
maw oracles
maw oracle
```

---

### Utilities

#### `maw completions [sub]`
Generate shell completions.

```bash
maw completions bash
maw completions zsh
```

#### `maw --version` / `maw -v`
Show version + git commit hash.

```bash
maw --version
maw -v
```

#### `maw --help` / `maw -h` / `maw`
Show help/usage.

```bash
maw
maw --help
maw -h
```

#### `maw serve [port]`
Start web UI server.

```bash
maw serve              # :3456 (default)
maw serve 8080         # :8080
```

---

## Web UI (Office)

Access at: **http://localhost:3456/office/** (after `maw serve`)

### Hash Routes

| Route | View | Description |
|-------|------|-------------|
| `#dashboard` | Dashboard | Status cards, tokens, command center, live feed |
| `#fleet` | Fleet | Stage (detailed rows) or Pitch (football formation) view |
| `#office` | Office | Room grid — sessions as colored rooms (default) |
| `#overview` | Overview | Compact agent grid |
| `#terminal` | Terminal | Full-screen xterm.js PTY shell |
| `#chat` | Chat | AI conversation log viewer |
| `#config` | Config | JSON config editor + PIN settings |

Examples:
```
http://localhost:3456/office/#dashboard
http://localhost:3456/office/#fleet
http://localhost:3456/office/#office
http://localhost:3456/office/#terminal
http://localhost:3456/office/#chat
```

Alternative builds:
- `/office-8bit` — 8-bit ASCII UI
- `/war-room` — War room view
- `/race-track` — Race track visualization
- `/superman` — Superman UI

---

## Configuration Examples

### Basic Local Setup
```json
{
  "host": "local",
  "port": 3456,
  "ghqRoot": "/Users/tanawat/ghq/github.com",
  "commands": {
    "default": "claude --dangerously-skip-permissions"
  },
  "sessions": {
    "firstgod": "01-firstgod",
    "nova": "02-nova"
  }
}
```

### Remote SSH Setup
```json
{
  "host": "white.local",
  "port": 3456,
  "ghqRoot": "/home/nat/Code/github.com",
  "tmuxSocket": "/tmp/tmux-1000/default",
  "oracleUrl": "http://localhost:47779",
  "env": {
    "CLAUDE_CODE_OAUTH_TOKEN": "your-token"
  },
  "commands": {
    "default": "claude --dangerously-skip-permissions --continue",
    "*-oracle": "claude --model claude-opus-4-6 --dangerously-skip-permissions"
  },
  "sessions": {
    "nexus": "01-oracles",
    "hermes": "07-hermes",
    "pulse": "09-pulse"
  },
  "pin": 1234
}
```

### Multi-Agent Team Setup
```json
{
  "host": "local",
  "ghqRoot": "/Users/dev/ghq/github.com",
  "commands": {
    "default": "claude --continue",
    "*-oracle": "claude --model claude-opus-4-6",
    "research-*": "claude --model claude-opus-4-6 --no-auto-approve",
    "codex-*": "codex --dangerously-auto-approve"
  },
  "sessions": {
    "alpha": "01-alpha",
    "beta": "02-beta",
    "gamma": "03-gamma",
    "delta": "04-delta",
    "research": "50-research",
    "codex": "60-codex"
  }
}
```

---

## Common Usage Patterns

### Daily Standup
```bash
# Check all agents
maw ls

# Peek status summaries
maw peek

# Check specific agents
maw neo
maw hermes
maw athena
```

### Start Work Session
```bash
# Wake specific agent with task
maw wake neo "fix authentication bug"

# Or: wake with GitHub issue
maw wake neo --issue 42

# Or: wake with new worktree
maw wake neo --new freelance

# Attach to interactive session
maw view neo
```

### Create & Assign Task
```bash
# Create issue + wake agent
maw pulse add "Implement feature X" --oracle neo --priority P1

# Check task board
maw pulse ls
```

### Collaborate with Agent
```bash
# Send message
maw hey neo "what's the current progress?"

# Wait for response
maw peek neo

# Persistent thread
maw talk-to neo "let me know when done"
```

### End Session & Sync
```bash
# Auto-save, commit, push, clean up
maw done neo

# Or: force cleanup without saving
maw done neo --force
```

### Monitor All Agents
```bash
# War room: all agents in split panes
maw overview

# Fleet status
maw oracle ls

# Check idle time
maw auto-sleep --dry-run

# Stop all
maw stop
```

### Resume Parked Work
```bash
# Park current tab with note
maw park "pending review, waiting for feedback"

# Check parked tabs
maw park ls

# Resume later
maw resume
```

---

## Key Features

### 1. Multi-Agent Orchestration
- Control dozens of agents from single CLI
- Send messages, commands, keyboard events
- Auto-wake agents when needed
- View status and screens in real-time

### 2. Fleet Management
- Initialize fleet from ghq repos
- Detect/fix numbering conflicts
- Validate configs
- Sync between local and remote

### 3. Worktree Automation
- Create/manage worktrees per agent
- Incubate (clone + worktree)
- Clean up stale/orphan worktrees
- Sync memory between worktrees

### 4. Task & Issue Integration
- Create GitHub issues + wake agents
- Pulse board for task tracking
- Auto-save (run /rrr + commit + push)
- Resume parked work

### 5. Web Dashboard
- Visual monitoring (office, war room, fleet views)
- Live chat/message viewer
- Configuration editor with PIN security
- Full PTY terminal in browser

### 6. Smart Messaging
- Send messages with auto-wake
- Persistent threads (talk-to)
- Send individual keyboard events
- Force send for offline agents

### 7. Team Hierarchies
- MegaAgent multi-level teams
- Federation status monitoring
- Peer connectivity tracking

---

## Troubleshooting

### "Connection refused" error
```bash
# Check if server is running
maw serve 3456

# Or set custom host
export MAW_HOST=localhost
maw ls
```

### Worktree cleanup issues
```bash
# Preview what would be cleaned
maw pulse cleanup --dry-run

# Clean stale worktrees
maw pulse cleanup
```

### Agent won't wake
```bash
# Try force wake
maw wake neo --issue 42

# Check if session exists
maw ls

# Force kill + wake
maw wake all --kill
```

### Config not loading
```bash
# Verify config location
cat ~/.config/maw/maw.config.json

# Or specify custom config dir
export MAW_CONFIG_DIR=/custom/path
maw ls
```

---

## Scripts & Aliases

Suggested shell aliases for common operations:

```bash
# Add to ~/.zshrc or ~/.bashrc

alias mls='maw ls'
alias mpeek='maw peek'
alias mhey='maw hey'
alias mwake='maw wake'
alias mdone='maw done'
alias mpulse='maw pulse'
alias mserve='maw serve'
alias mtalk='maw talk-to'
alias mfleet='maw fleet'
alias moracle='maw oracle'
alias mmega='maw mega'

# Quick functions
function mstart-all() { maw wake all --resume; }
function mstop-all() { maw stop; }
function mdesk() { maw overview; }
function mstatus() { maw oracle ls; }
```

---

## Version & History

- **Current Version**: 1.1.0
- **Evolution**:
  - Oct 2025: `maw.env.sh` (30+ shell commands)
  - Mar 2026: `oracles()` zsh (ghq-based launcher)
  - Mar 2026: `maw.js` (Bun/TS + Web UI)

---

## Additional Resources

- **GitHub**: https://github.com/Soul-Brews-Studio/maw-js
- **Demo**: https://www.facebook.com/reel/1513957190087776
- **Community**: https://www.facebook.com/groups/1461988771737551

---

**Last Updated**: 2026-03-30
**Generated from**: maw.js v1.1.0 source analysis
