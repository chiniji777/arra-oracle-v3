# maw.js Architecture

## Overview

**maw.js** is a multi-agent workflow orchestration system for remote tmux session management via SSH or local connections. It combines a TypeScript CLI, a Bun/Hono backend server, and a React web UI to provide real-time monitoring and control of distributed agent sessions across local and federated peers.

**Version**: 1.1.0
**Runtime**: Bun (TypeScript/JavaScript)
**Key Insight**: Single `<source>` of truth — multiple `<target>` views with real-time two-way synchronization via WebSocket.

---

## Directory Structure & Organization Philosophy

```
maw-js/
├── src/                      # Backend: CLI + Server logic (Bun/TS)
│   ├── cli.ts               # Entry point (#!/usr/bin/env bun)
│   ├── server.ts            # Hono app: REST API + WebSocket + static file serving
│   ├── engine.ts            # Core: WebSocket connection manager + interval orchestration
│   ├── engine.capture.ts    # Terminal capture + preview logic
│   ├── engine.status.ts     # Activity detection + busy-agent scanning
│   ├── engine.teams.ts      # Agent team discovery + grouping
│   ├── handlers.ts          # WebSocket message handlers (subscribe, send, wake, etc.)
│   │
│   ├── tmux.ts              # Typed tmux CLI wrapper (session/window management)
│   ├── ssh.ts               # Unified SSH/local execution layer
│   ├── peers.ts             # Federation: peer discovery + aggregated sessions
│   ├── pty.ts               # PTY spawn for local pseudo-terminals
│   │
│   ├── commands/            # CLI subcommands (fleet, wake, done, talk-to, etc.)
│   │   ├── fleet.ts         # Fleet operations: sync, add, remove
│   │   ├── wake.ts          # Spawn sessions + sessions + windows
│   │   ├── sleep.ts         # Auto-sleep detection + hibernation
│   │   ├── done.ts          # Mark agent as complete
│   │   ├── talk-to.ts       # Thread-based agent messaging
│   │   ├── oracle.ts        # Oracle project/credential management
│   │   ├── mega.ts          # Batch operations on multiple agents
│   │   └── ... (25+ others)
│   │
│   ├── lib/
│   │   └── feed.ts          # Feed event parser (oracle events)
│   │
│   ├── config.ts            # Load/save ~/.config/maw/maw.config.json
│   ├── paths.ts             # Config dir + fleet dir locations
│   ├── types.ts             # WebSocket types (MawWS, Handler, etc.)
│   └── tab-order.ts         # Restore tmux tab ordering
│
├── office/                   # Frontend: React + Vite
│   ├── src/
│   │   ├── App.tsx          # Root component: hash routing, floating UI
│   │   ├── main.tsx         # React entry point
│   │   │
│   │   ├── components/      # 40+ components
│   │   │   ├── TerminalView.tsx    # xterm.js full-screen terminal
│   │   │   ├── RoomGrid.tsx        # Sessions as colored rooms (default)
│   │   │   ├── FleetGrid.tsx       # Detailed rows (Stage) or football field (Pitch)
│   │   │   ├── OverviewGrid.tsx    # Compact agent grid
│   │   │   ├── OrbitalView.tsx     # 3D agent visualization (Three.js)
│   │   │   ├── MissionControl.tsx  # Command center + live feed
│   │   │   ├── DashboardView.tsx   # Status cards + metrics
│   │   │   ├── HoverPreviewCard.tsx # Rich preview on agent hover
│   │   │   ├── ConfigView.tsx      # JSON config editor
│   │   │   ├── InboxView.tsx       # Message inbox
│   │   │   ├── ChatView.tsx        # AI conversation log viewer
│   │   │   ├── WorktreeView.tsx    # Worktree isolation UI
│   │   │   ├── ProjectsView.tsx    # Project management
│   │   │   ├── VSView.tsx          # Monaco code editor view
│   │   │   ├── TeamPanel.tsx       # Agent grouping/team UI
│   │   │   ├── OracleSearch.tsx    # Oracle AI search
│   │   │   ├── AccountsView.tsx    # Account management
│   │   │   └── ... (many more)
│   │   │
│   │   ├── hooks/           # React custom hooks
│   │   │   ├── useWebSocket.ts    # WebSocket connection + message handler
│   │   │   ├── useSessions.ts     # Session state + aggregation
│   │   │   └── useVoiceHotkey.tsx # Voice input via microphone
│   │   │
│   │   ├── lib/
│   │   │   ├── sounds.ts    # Audio notification profiles
│   │   │   └── ... (styling, utils)
│   │   │
│   │   └── styles/          # TailwindCSS + custom CSS modules
│   │
│   ├── vite.config.ts       # Vite config: React plugin, API proxy to :3456
│   └── index.html           # Entry HTML
│
├── office-8bit/             # Bevy WASM: 8-bit retro UI (dist-8bit-office)
├── test/                    # Test utilities + fixtures
├── fleet/                   # Fleet state: session configs (checked into git)
├── dist-office/             # Built React app (vite build output)
├── dist-cf/                 # Cloudflare Worker build
│
├── maw.config.json          # Local config (gitignored)
├── maw.config.example.json  # Config template
├── tmux.conf                # Default tmux configuration
├── ecosystem.config.cjs     # PM2 process manager config
├── package.json             # Dependencies: Hono, React, Three.js, xterm.js
├── bun.lock                 # Bun lockfile
├── README.md                # Quick start guide
└── .envrc                   # direnv environment setup
```

---

## Core System Architecture

### Layer 1: SSH/Local Execution

**Entry Point**: `ssh.ts` → `ssh()` function

Provides unified execution layer over SSH or local shell:
- Routes to `Bun.spawn(["bash", "-c", cmd])` for local operations
- Routes to `Bun.spawn(["ssh", host, cmd])` for remote SSH targets
- Executes tmux commands via `tmuxCmd()` (optionally with `-S <socket>`)

Key functions:
- `capture(target, lines)` — Get pane content via `tmux capture-pane`
- `sendKeys(target, text)` — Send input to pane via `tmux send-keys`
- `selectWindow(target)` — Focus a tmux window
- `listSessions()` — List all tmux sessions
- `getPaneCommand(target)` — Get running command in a pane

### Layer 2: Tmux Wrapper

**Entry Point**: `tmux.ts` → `Tmux` class

Typed wrapper around tmux CLI with safe argument quoting:
- Constructor takes `host` (optional) and `socket` (optional)
- Methods build tmux subcommand arg arrays, delegate to `run()` or `tryRun()`
- `run()` calls `ssh()` with fully built command
- Auto-handles socket flag, error codes, trimming

Key methods:
- `listAll()` — Get all sessions/windows in one tmux call
- `hasSession(name)` — Check session exists
- `newSession(name, opts)` — Create session with options (cols, rows, cwd, etc.)
- `killWindow(target)` — Kill pane/window
- `renameSession(old, new)` — Rename session
- `getPaneCommand(target)` / `getPaneCommands(targets)` — Batch fetch running commands

**Singleton**: `export const tmux = new Tmux()` — Default instance used throughout

### Layer 3: WebSocket Engine

**Entry Point**: `engine.ts` → `MawEngine` class

Central nervous system for real-time updates. Manages:
- **Client pool**: `Set<MawWS>` — All connected browser clients
- **Handler registry**: `Map<string, Handler>` — Message type → handler function
- **Caches**:
  - `lastContent` — Previous capture per client (diff to avoid duplicate sends)
  - `lastPreviews` — Preview captures per target (15-line summaries)
  - `sessionCache` — Latest session list + JSON string
  - `peerSessionsCache` — Aggregated sessions from federation peers
  - `feedBuffer` — Last 50 feed events

**Interval-driven updates** (on WebSocket open, stopped when last client closes):
- `captureInterval` (50ms) — Push screen captures to subscribed clients
- `sessionInterval` (5s) — Broadcast session list changes
- `previewInterval` (2s) — Push target previews for hover cards
- `statusInterval` (3s) — Scan busy agents + detect activity
- `teamsInterval` (3s) — Watch agent team assignments
- `peerInterval` (10s) — Fetch aggregated peer sessions
- `chatPollInterval` (5s) — Poll Oracle threads for new chat messages

**Handler pattern**: `(ws: MawWS, data: any, engine: MawEngine) => void | Promise<void>`

Built-in handlers (in `handlers.ts`):
- `subscribe(target)` — Subscribe client to terminal updates
- `subscribePreviews(targets)` — Subscribe to preview cards
- `select(target)` — Focus window
- `send(target, text, force)` — Send input to pane
- `wake(target, command)` — Spawn or resume session
- `sleep(target)` — Send Ctrl+C
- `stop(target)` — Kill window
- `openTerminal(session)` — Open WezTerm window

### Layer 4: Feed Event System

**Purpose**: Unified activity log from all Oracles

**Format** (JSONL in `~/.oracle/maw-log.jsonl` and Oracle threads):
```
ts: ISO timestamp
from: speaker (oracle or human name)
to: recipient (target oracle or "system"/"thread")
msg: message content
ch: channel or thread title
```

**Event types** (from `lib/feed.ts`):
- `PreToolUse` — Starting tool (with tool name + details)
- `PostToolUse` / `PostToolUseFailure` — Tool result
- `UserPromptSubmit` — Human prompt received
- `SubagentStart` / `SubagentStop` — Subagent lifecycle
- `TaskCompleted` — Task finished
- `SessionStart` / `SessionEnd` — Session lifecycle
- `Stop` — Explicit stop
- `Notification` — Alert event

**Activity display** via `describeActivity()` — Human-readable one-liners with icons.

### Layer 5: Federation (Peer Integration)

**Entry Point**: `peers.ts` → federation functions

Aggregates sessions from multiple maw instances via HTTP:
- `getPeers()` — Read peer URLs from config
- `getAggregatedSessions(localSessions)` — Merge local + peer sessions, tag each with `source` field
- `getFederationStatus()` — Check peer connectivity (with latency)
- `checkPeerReachable(url)` — HEAD request with 5s timeout
- `findPeerForTarget(target, localSessions)` — Route action to correct peer
- `sendKeysToPeer(peerUrl, target, text)` — Forward command to peer

**Configuration**:
```json
{
  "peers": ["http://peer1.local:3456", "http://peer2.local:3456"]
}
```

Each peer is polled every 10s; results cached and broadcast to UI.

---

## REST API (Hono)

**Base**: `:3456/api/`

### Session Management
- `GET /api/sessions` — List all sessions (local + peers, filter out `-view` and `maw-pty-*`)
- `POST /api/send` — Send text to target (routes to peer if needed)
- `POST /api/select` — Focus window
- `POST /api/jump` — Focus window + raise iTerm (macOS)
- `GET /api/capture?target=X&lines=80&cols=80` — Get pane content + auto-resize

### Federation
- `GET /api/federation/status` — Peer connectivity report

### Oracle Proxy (to `/api/oracle/...` endpoints)
- `GET /api/oracle/search?q=X&mode=hybrid&limit=10` — Search Oracle database
- `GET /api/oracle/traces` — Recent activity traces
- `GET /api/oracle/stats` — Statistics
- `GET /api/oracle/projects` — Project list
- `POST /api/oracle/projects` — Create project
- `GET /api/oracle/projects/{id}` — Get project details
- `*` `/api/oracle/projects/*` — Full CRUD proxy to Oracle API

### UI State
- `GET /api/ui-state` — Retrieve persistent UI layout (cross-device)
- `POST /api/ui-state` — Save UI state

### Static Files
- `GET /` → `dist-office/index.html` (React SPA entry point)
- `GET /assets/*` → Vite-built assets
- `GET /office/*` → Backward compat redirect to React app
- `GET /office-8bit` → Bevy WASM 8-bit UI
- `GET /war-room` → Bevy WASM war room
- `GET /race-track` → Bevy WASM race track
- `GET /superman` → Bevy WASM superman universe

---

## WebSocket Protocol

**Connection**: `ws://localhost:3456`

### Message Format
All messages are JSON objects with a required `type` field.

### Client → Server

**Session subscription**:
```json
{ "type": "subscribe", "target": "session:0" }
```

**Preview subscription**:
```json
{ "type": "subscribePreviews", "targets": ["session:0", "session:1"] }
```

**Send input**:
```json
{ "type": "send", "target": "session:0", "text": "claude -c", "force": false }
```

**Window selection**:
```json
{ "type": "select", "target": "session:0" }
```

**Wake/spawn**:
```json
{ "type": "wake", "target": "session:0", "command": "claude --continue" }
```

**Sleep (Ctrl+C)**:
```json
{ "type": "sleep", "target": "session:0" }
```

**Stop (kill window)**:
```json
{ "type": "stop", "target": "session:0" }
```

**Open terminal**:
```json
{ "type": "openTerminal", "session": "session", "target": "session:0" }
```

### Server → Client

**Session list**:
```json
{
  "type": "sessions",
  "sessions": [
    { "name": "session", "windows": [{ "index": 0, "name": "window", "active": true }] }
  ]
}
```

**Terminal capture**:
```json
{ "type": "capture", "target": "session:0", "content": "..." }
```

**Previews**:
```json
{ "type": "previews", "data": { "session:0": "...", "session:1": "..." } }
```

**Busy agents**:
```json
{
  "type": "busyAgents",
  "agents": [{ "name": "oracle", "window": "0", "command": "claude", "activity": "..." }]
}
```

**Feed events**:
```json
{ "type": "feed", "event": { "ts": 1234567890, "from": "oracle", "to": "human", "msg": "..." } }
```

**Team data**:
```json
{ "type": "teams", "teams": [...] }
```

**Message log**:
```json
{ "type": "maw-log", "entries": [...] }
```

**Errors**:
```json
{ "type": "error", "error": "description" }
```

**Action responses**:
```json
{ "type": "action-ok", "action": "wake", "target": "session:0" }
```

---

## Configuration (maw.config.json)

Located at `~/.config/maw/maw.config.json`:

```json
{
  "host": "local",                    // SSH target (default: local)
  "port": 3456,                       // Server listen port
  "tmuxSocket": "/path/to/socket",    // Optional custom tmux socket
  "ghqRoot": "/home/user/Code/github.com",  // ghq root for project resolution
  "oracleUrl": "http://localhost:47779",    // Oracle v2 server URL
  "env": {
    "CLAUDE_CODE_OAUTH_TOKEN": "..."  // Environment variables
  },
  "commands": {
    "default": "claude --dangerously-skip-permissions --continue",
    "*-oracle": "claude --dangerously-skip-permissions --continue",
    "codex-*": "codex --dangerously-auto-approve --search"
  },
  "sessions": {
    "nexus": "01-oracles",
    "hermes": "07-hermes"
  },
  "peers": [
    "http://peer1.local:3456",
    "http://peer2.local:3456"
  ]
}
```

---

## CLI Commands (src/commands/)

**Invocation**: `bun src/cli.ts <command> [args]` or `maw <command> [args]` (after `bun link`)

### Core Commands

**`fleet sync`** — Sync fleet definition with tmux
- Reads from `~/.config/maw/fleet/`
- Creates/updates sessions, windows, and Agent assignments

**`wake <agent>`** — Spawn new session/window
- Resolves command from `commands` config
- Logs wake event to maw-log.jsonl
- Checks initial status, retries shell→Claude transitions

**`sleep`** — Auto-sleep inactive agents
- Scans maw-log.jsonl for activity
- Hibernates agents inactive >30 minutes
- Respects `--protect` flag for critical agents

**`done <agent> [status]`** — Mark agent as complete
- Updates session metadata
- Optionally hibernates agent
- Logs completion to feed

**`talk-to <agent> <message>`** — Send message via threads
- Posts to Oracle thread
- Waits for agent response (optional)
- Logs to chat feed

**`mega <action> <pattern>`** — Batch operations
- Apply action to multiple agents
- Patterns: `oracle-*`, `*`, specific names

**`oracle <action> [args]`** — Oracle project management
- Manage credentials and project assignments

### Monitoring Commands

**`pulse`** — Live feed of all agent activity
- Streams feed events in real-time
- Color-coded by event type

**`overview`** — Compact agent status grid
- 80-column ASCII representation
- Shows busy agents + timestamps

**`peek [agent]`** — Quick status snapshot
- One-liner per agent or full screen for one

### Dev/Admin Commands

**`completions`** — Shell completion script generation
- Bash/Zsh compatible

**`fleet-init`** — Initialize fleet configuration
- Creates example fleet structure

**`contacts [add|list|remove]`** — Manage team contacts
- Store + retrieve agent contact info

**`federation`** — Federation status
- Check peer connectivity + latency

---

## React UI Architecture (office/)

### Hash Routes (Virtual Router)

Located in `App.tsx`, accessed via URL fragments:

- **`#office`** (default) — RoomGrid: Sessions as colored rooms
- **`#dashboard`** — DashboardView: Status cards, tokens, live feed
- **`#fleet`** — FleetGrid: Detailed rows (Stage) or football field visualization (Pitch)
- **`#overview`** — OverviewGrid: Compact agent grid (mini-monitors)
- **`#terminal`** — TerminalView: Full-screen xterm.js PTY
- **`#chat`** — ChatView: AI conversation log viewer
- **`#config`** — ConfigView: JSON config editor with PIN lock
- **`#inbox`** — InboxView: Message queue
- **`#projects`** — ProjectsView: Project explorer
- **`#worktree`** — WorktreeView: Git worktree isolation UI
- **`#orbital`** — OrbitalView: 3D agent orbital visualization (Three.js)
- **`#accounts`** — AccountsView: Account / OAuth management
- **`#camera`** — CameraView: Webcam input
- **`#test-workflow`** — TestWorkflowView: Test runner UI
- **`#vs`** — VSView: Monaco code editor

### Key Components

**Terminal Display**:
- `TerminalView.tsx` — Full-screen xterm.js with PTY emulation
- `HoverPreviewCard.tsx` — Rich hover popup (15-line preview + metadata)

**Session Views**:
- `RoomGrid.tsx` — Sessions as colored boxes, windows inside
- `FleetGrid.tsx` — Rows (Stage mode) or formations (Pitch mode)
- `OverviewGrid.tsx` — Mini-monitor grid with status indicators

**Control Center**:
- `MissionControl.tsx` — Command input, broadcast, search, live feed
- `FleetControls.tsx` — Batch actions on selected agents

**Utilities**:
- `PinLock.tsx` — PIN entry for sensitive views (config)
- `ShortcutOverlay.tsx` — Keyboard shortcut help
- `JumpOverlay.tsx` — Agent quick-jump interface
- `UniverseBg.tsx` — Animated starfield background
- `StatusBar.tsx` — Top status indicator

### State Management

**WebSocket Hook** (`useWebSocket.ts`):
- Single WebSocket connection per browser session
- Auto-reconnect on disconnect
- Message routing to handlers

**Sessions Hook** (`useSessions.ts`):
- Stores session list from server
- Tracks active subscriptions
- Computes busy agents + recent activity

**Voice Input Hook** (`useVoiceHotkey.tsx`):
- Microphone capture via Web Audio API
- Real-time transcription integration

### Styling

- **TailwindCSS** (v4.2.1) for utility classes
- **CSS Modules** for scoped styles (e.g., `Overview.module.css`)
- **Dynamic theme colors** — Agents assigned RGB colors from palette
- **Responsive layout** — Mobile-friendly with breakpoints

---

## Dependencies

### Production

**Backend**:
- `hono@4.12.5` — Lightweight HTTP framework (REST + WebSocket)
- (Bun stdlib for process spawning, file I/O, etc.)

**Frontend**:
- `react@19.0.0` — UI framework
- `react-dom@19.0.0` — DOM rendering
- `zustand@5.0.11` — State management (lightweight alternative to Redux)
- `@monaco-editor/react@4.7.0` — Code editor component
- `@xterm/xterm@5.5.0` + `@xterm/addon-fit@0.10.0` — Terminal emulator
- `three@0.183.2` — 3D graphics (orbital view)

### Development

- `vite@6.0.0` — Build tool + dev server
- `@vitejs/plugin-react@4.3.0` — React fast refresh
- `tailwindcss@4.2.1` + `@tailwindcss/vite@4.2.1` — Styling
- `typescript` — Type safety
- `@types/react*`, `@types/three` — Type definitions

---

## Entry Points

### CLI

**File**: `src/cli.ts`
**Shebang**: `#!/usr/bin/env bun`
**Execution**: `bun src/cli.ts <command> [args]` or `maw <command> [args]`

1. Parses command line arguments
2. Loads config from `~/.config/maw/maw.config.json`
3. Dispatches to `src/commands/{command}.ts`
4. Executes command logic (SSH, tmux, file I/O)
5. Outputs results to stdout/stderr

### Server

**File**: `src/server.ts`
**Startup**: `bun src/server.ts` (on port 3456)

1. Creates Hono app
2. Registers REST API routes
3. Registers WebSocket handler via Hono
4. Serves React app from `dist-office/`
5. Listens for connections

**Typical startup** (via PM2):
```bash
pm2 start ecosystem.config.cjs
# Starts: maw (server) + maw-dev (Vite HMR) on ports 3456 + 5173
```

### Web UI

**File**: `office/src/main.tsx`
**Built**: `cd office && bun run build` → `dist-office/`
**Served**: `GET / → dist-office/index.html`

1. Mounts React App at `#root`
2. Opens WebSocket to `ws://localhost:3456`
3. Renders hash-routed UI
4. Handles keyboard shortcuts + microphone input

---

## Data Flow Diagram

```
┌─────────────────┐
│  Browser (UI)   │
│   React App     │
│  xterm.js       │
└────────┬────────┘
         │ WebSocket
         │ JSON messages
         ▼
┌─────────────────────────────────┐
│      Hono Server (3456)         │
│  - REST API endpoints           │
│  - WebSocket handler            │
│  - Static file serving          │
│  - Oracle proxy                 │
│  - UI state persistence         │
└────────┬────────────────────────┘
         │
         ├─→ ┌──────────────────────┐
         │   │  MawEngine           │
         │   │  - Client pool       │
         │   │  - Message handlers  │
         │   │  - Interval timers   │
         │   │  - Capture/preview   │
         │   │  - Feed polling      │
         │   │  - Team scanning     │
         │   └──────────┬───────────┘
         │              │
         │              ├─→ Tmux (via SSH)
         │              │   - Session list
         │              │   - Window state
         │              │   - Terminal I/O
         │              │
         │              ├─→ Peer API (HTTP)
         │              │   - Federated sessions
         │              │   - Remote sends
         │              │
         │              ├─→ Oracle API (HTTP)
         │              │   - Search
         │              │   - Threads/chat
         │              │   - Projects
         │              │
         │              └─→ Feed Events
         │                  - maw-log.jsonl
         │                  - Oracle threads
         │
         └─→ REST API calls
             - /api/sessions
             - /api/capture
             - /api/send
             - /api/federation/status
             - /api/oracle/*
             - /api/ui-state
```

---

## Key Design Patterns

### 1. **Source of Truth Pattern**

**Single source**: Tmux state (real sessions/windows)
**Multiple targets**: WebSocket clients, peers, external APIs

- Engine maintains cache of latest capture + previews
- Diffs against previous to avoid redundant sends
- Clients can subscribe to targets independently

### 2. **Unified Execution Layer**

All remote operations funnel through `ssh()` in `ssh.ts`:
- Local: `Bun.spawn(["bash", "-c", cmd])`
- Remote: `Bun.spawn(["ssh", host, cmd])`

This allows same codebase to work on local tmux or SSH-based agents.

### 3. **Handler Registry Pattern**

WebSocket message types → handler functions:
```ts
engine.on("subscribe", subscribe);
engine.on("send", send);
engine.on("wake", wake);
```

Handlers are pure functions; side effects (I/O) are isolated.

### 4. **Interval-Driven Architecture**

Real-time updates via polling intervals (not event-driven) — simpler, more predictable, easier to debug:
- 50ms capture → responsive terminal
- 2s previews → hover cards stay fresh
- 5s sessions → session list changes
- 3s status → busy-agent detection
- 10s peers → federation syncing

### 5. **Federation via HTTP**

Peer maw instances are just additional HTTP targets:
- No special networking required
- Each peer is independent (no clustering)
- Sessions tagged with `source` field for routing
- Fallback to local if peer unreachable

### 6. **Caching Strategy**

- **lastContent** map — Avoid sending duplicate terminal captures
- **lastPreviews** map — Cache 15-line summaries per target
- **sessionCache** — Cache session list + JSON string
- **feedBuffer** — Last 50 events (sent to new clients)
- **peerSessionsCache** — Aggregated peer sessions (10s TTL)

### 7. **Event Feed System**

Unified activity log across all Oracles:
- JSONL format (one event per line)
- Stored locally in `~/.oracle/maw-log.jsonl`
- Also written to Oracle threads
- Parsed + broadcast to WebSocket clients
- Used for UI activity indicators + auto-sleep detection

---

## Extension Points

### Adding a New CLI Command

1. Create `src/commands/my-command.ts`
2. Export default handler:
```ts
export default async function(args: string[]) {
  // Parse args, perform logic, output results
}
```
3. Command auto-discovered by cli.ts

### Adding a New WebSocket Message Type

1. Define handler in `handlers.ts`:
```ts
const myHandler: Handler = (ws, data, engine) => {
  // Access ws.data.target, engine.clients, etc.
};
```
2. Register in `registerBuiltinHandlers()`:
```ts
engine.on("my-type", myHandler);
```
3. Client sends:
```json
{ "type": "my-type", "payload": {...} }
```

### Adding a New Route View

1. Create React component `office/src/components/MyView.tsx`
2. Add to hash route in `App.tsx`
3. Hook into `useWebSocket()` and `useSessions()` for state

### Adding a New REST Endpoint

1. Add route to `server.ts`:
```ts
app.get("/api/my-endpoint", async (c) => {
  // c.req, c.json(), etc.
});
```
2. Called from UI or CLI via fetch/curl

---

## Deployment

### Local Development

```bash
# Terminal 1: Backend + Server
bun run dev        # pm2 watch src/

# Terminal 2: Frontend HMR
cd office && bun run dev   # Vite on :5173

# Open browser
open http://localhost:3456
```

Vite proxies `/api/*` to backend on `:3456` (via `vite.config.ts`).

### Production

```bash
# Build React
bun run build:office

# Serve everything from backend
bun src/server.ts

# Or via PM2
pm2 start ecosystem.config.cjs
```

Backend serves both API and React app from `dist-office/`.

### Cloudflare Worker Deployment

```bash
bun run deploy:cf
```

Builds to `dist-cf/` and deploys via `wrangler`.

---

## Summary

**maw.js** is a sophisticated but modular multi-agent workflow orchestrator. Its strength lies in:

1. **Unified SSH/local execution** — One codebase, multiple deployment targets
2. **Real-time WebSocket synchronization** — Instant terminal + agent updates
3. **Federation support** — Aggregate sessions from multiple peers
4. **Rich web UI** — 40+ components, multiple visualization modes
5. **CLI + Server dual mode** — Works as standalone tool or infrastructure
6. **Simple, predictable intervals** — No event-driven complexity
7. **Extensibility** — Easy to add commands, endpoints, handlers, views

Core insight: **maw acts as a multiplexer and visualization layer** for distributed tmux sessions, bridging local/remote terminals with a unified web interface and REST API.
