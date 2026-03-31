# maw-js Learning Index

## Source
- **Origin**: ./origin/
- **Location**: /private/tmp/maw-js

## Explorations

### 2026-03-30 1319 (default)
- [2026-03-30/1319_ARCHITECTURE](2026-03-30/1319_ARCHITECTURE.md)
- [2026-03-30/1319_CODE-SNIPPETS](2026-03-30/1319_CODE-SNIPPETS.md)
- [2026-03-30/1319_QUICK-REFERENCE](2026-03-30/1319_QUICK-REFERENCE.md)

**Key insights**:
- maw.js is a multi-agent workflow orchestrator built on tmux + WebSocket + Hono
- 3-layer architecture: CLI (43 TS files, 40+ commands) → Engine (WebSocket real-time) → Web UI (React + xterm.js)
- Federation via HTTP for cross-machine agent routing, no clustering needed
- Polling at multiple frequencies (50ms capture, 2s preview, 5s sessions) for real-time feel
- Unified SSH/local execution — same code works local or remote
