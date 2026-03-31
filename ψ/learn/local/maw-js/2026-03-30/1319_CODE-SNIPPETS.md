# maw.js Code Snippets & Architecture Reference

**Project**: maw.js — Multi-Agent Workflow in Bun/TS
**Version**: 1.1.0
**Purpose**: Remote tmux orchestra control — CLI + Web UI for managing agent sessions
**Date**: 2026-03-30

---

## Overview

maw.js is a full-stack system for orchestrating multi-agent workflows across multiple machines. It uses:
- **Backend**: Hono HTTP server (Bun runtime) + WebSocket engine for real-time tmux control
- **Frontend**: React + Zustand + Three.js for orbital visualization
- **Transport**: REST API + WebSocket for bidirectional control
- **Clustering**: Federation support to control agents across peer machines

---

## 1. Entry Point & CLI Structure

### `/private/tmp/maw-js/src/cli.ts` (Partial - 277KB compiled, built-in)

The CLI is transpiled into a single executable. Key sections:

```typescript
// src/cli.ts (excerpt from compiled version)
// --- Paths setup ---
var init_paths = __esm(() => {
  CONFIG_DIR = process.env.MAW_CONFIG_DIR || join(homedir(), ".config", "maw");
  FLEET_DIR = join(CONFIG_DIR, "fleet");
  CONFIG_FILE = join(CONFIG_DIR, "maw.config.json");
  mkdirSync(FLEET_DIR, { recursive: true });
});

// --- Config loading ---
function loadConfig() {
  if (cached) return cached;
  try {
    const raw = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    cached = { ...DEFAULTS, ...raw };
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached;
}

function saveConfig(update) {
  const current = loadConfig();
  const merged = { ...current, ...update };
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  resetConfig();
  return loadConfig();
}
```

**Key Config Defaults**:
- `host`: "white.local" (default machine)
- `port`: 3456 (HTTP server)
- `tmuxSocket`: Optional custom tmux socket path
- `peers`: Array of peer URLs for federation
- `commands`: Pattern-based command resolver (e.g., match "01-nova" → "claude --model=...")
- `env`: Masked environment variables

---

## 2. Core Engine Architecture

### `/private/tmp/maw-js/src/engine.ts` — WebSocket Message Router & Interval Manager

```typescript
export class MawEngine {
  private clients = new Set<MawWS>();
  private handlers = new Map<string, Handler>();
  private lastContent = new Map<MawWS, string>();
  private lastPreviews = new Map<MawWS, Map<string, string>>();
  private sessionCache = { sessions: [] as SessionInfo[], json: "" };
  private status = new StatusDetector();
  private peerSessionsCache: (Session & { source?: string })[] = [];

  // Multiple polling intervals for different data streams
  private captureInterval: ReturnType<typeof setInterval> | null = null;
  private sessionInterval: ReturnType<typeof setInterval> | null = null;
  private previewInterval: ReturnType<typeof setInterval> | null = null;
  private statusInterval: ReturnType<typeof setInterval> | null = null;
  private teamsInterval: ReturnType<typeof setInterval> | null = null;
  private peerInterval: ReturnType<typeof setInterval> | null = null;
  private chatPollInterval: ReturnType<typeof setInterval> | null = null;

  constructor({ feedBuffer, feedListeners }: { feedBuffer: FeedEvent[]; feedListeners: Set<(event: FeedEvent) => void> }) {
    this.feedBuffer = feedBuffer;
    this.feedListeners = feedListeners;
    registerBuiltinHandlers(this);
  }

  // Register a handler for a message type
  on(type: string, handler: Handler) { this.handlers.set(type, handler); }

  // --- WebSocket lifecycle ---
  handleOpen(ws: MawWS) {
    this.clients.add(ws);
    this.startIntervals();
    // Send cached sessions on connect
    if (this.sessionCache.sessions.length > 0) {
      ws.send(JSON.stringify({ type: "sessions", sessions: this.sessionCache.sessions }));
      sendBusyAgents(ws, this.sessionCache.sessions);
    } else {
      tmux.listAll().then(sessions => {
        this.sessionCache.sessions = sessions;
        ws.send(JSON.stringify({ type: "sessions", sessions }));
        sendBusyAgents(ws, sessions);
      }).catch(() => {});
    }
    // Send recent feed history
    ws.send(JSON.stringify({ type: "feed-history", events: this.feedBuffer.slice(-50) }));
  }

  handleMessage(ws: MawWS, msg: string | Buffer) {
    try {
      const data = JSON.parse(msg as string);
      const handler = this.handlers.get(data.type);
      if (handler) handler(ws, data, this);
    } catch {}
  }

  handleClose(ws: MawWS) {
    this.clients.delete(ws);
    this.lastContent.delete(ws);
    this.lastPreviews.delete(ws);
    this.stopIntervals();
  }

  // --- Polling intervals ---
  private startIntervals() {
    if (this.captureInterval) return;

    // Terminal capture every 50ms (high frequency for interactivity)
    this.captureInterval = setInterval(() => {
      for (const ws of this.clients) this.pushCapture(ws);
    }, 50);

    // Session list every 5s
    this.sessionInterval = setInterval(async () => {
      this.sessionCache.sessions = await broadcastSessions(this.clients, this.sessionCache, this.peerSessionsCache);
    }, 5000);

    // Peer sessions every 10s (federation)
    this.peerInterval = setInterval(async () => {
      if (getPeers().length === 0) { this.peerSessionsCache = []; return; }
      const all = await getAggregatedSessions([]);
      this.peerSessionsCache = all;
    }, 10000);

    // Preview panes every 2s
    this.previewInterval = setInterval(() => {
      for (const ws of this.clients) this.pushPreviews(ws);
    }, 2000);

    // Status detection every 3s
    this.statusInterval = setInterval(() => {
      this.status.detect(this.sessionCache.sessions, this.clients, this.feedListeners);
    }, 3000);

    // Team/agent liveness every 3s
    this.teamsInterval = setInterval(() => {
      broadcastTeams(this.clients, this.lastTeamsJson);
    }, 3000);

    // Poll Oracle for new chat messages every 5s
    const listener = (event: FeedEvent) => {
      const msg = JSON.stringify({ type: "feed", event });
      for (const ws of this.clients) ws.send(msg);
    };
    this.feedListeners.add(listener);
    this.feedUnsub = () => this.feedListeners.delete(listener);

    const oracleUrl = process.env.ORACLE_URL || loadConfig().oracleUrl;
    this.chatPollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${oracleUrl}/api/threads?limit=10`);
        if (!res.ok) return;
        const { threads } = await res.json() as any;
        if (!threads?.length) return;

        const newEntries: any[] = [];
        for (const t of threads.slice(0, 10)) {
          const d = await fetch(`${oracleUrl}/api/thread/${t.id}`).then(r => r.json()).catch(() => null) as any;
          if (!d?.messages) continue;
          for (const m of d.messages) {
            if (m.id > this.lastSeenMessageId) {
              const channelMatch = d.thread?.title?.match(/^(?:channel|topic):(.+?)(?::.*)?$/);
              const agent = channelMatch?.[1] || null;
              let from = m.author || m.role || "unknown";
              let to = "system";
              if (agent) {
                if (m.role === "human") { from = m.author || "human"; to = agent; }
                else { from = agent; to = m.author && m.author !== agent ? m.author : "human"; }
              } else { to = d.thread?.title || "thread"; }
              newEntries.push({
                ts: typeof m.created_at === "number" ? new Date(m.created_at).toISOString() : m.created_at,
                from, to, msg: m.content || "", ch: d.thread?.title || `thread-${d.thread?.id}`,
              });
              this.lastSeenMessageId = Math.max(this.lastSeenMessageId, m.id);
            }
          }
        }
        if (newEntries.length > 0) {
          const payload = JSON.stringify({ type: "maw-log", entries: newEntries });
          for (const ws of this.clients) ws.send(payload);
        }
      } catch {}
    }, 5000);
  }

  private stopIntervals() {
    if (this.clients.size > 0) return;
    // ... clean up all intervals
  }
}
```

---

## 3. Message Handlers & Command Dispatch

### `/private/tmp/maw-js/src/handlers.ts` — Built-in WebSocket Handlers

```typescript
// Helper to run async actions with standard response
async function runAction(ws: MawWS, action: string, target: string, fn: () => Promise<void>) {
  try {
    await fn();
    ws.send(JSON.stringify({ type: "action-ok", action, target }));
  } catch (e: any) {
    ws.send(JSON.stringify({ type: "error", error: e.message }));
  }
}

// === Subscription Handlers ===
const subscribe: Handler = (ws, data, engine) => {
  ws.data.target = data.target;
  engine.pushCapture(ws);
};

const subscribePreviews: Handler = (ws, data, engine) => {
  ws.data.previewTargets = new Set(data.targets || []);
  engine.pushPreviews(ws);
};

// === Terminal Control ===
const send: Handler = async (ws, data, engine) => {
  // Check for active Claude session before sending (#17)
  if (!data.force) {
    try {
      const cmd = await getPaneCommand(data.target);
      if (!/claude|codex|node/i.test(cmd)) {
        ws.send(JSON.stringify({ type: "error", error: `no active Claude session in ${data.target} (running: ${cmd})` }));
        return;
      }
    } catch { /* pane check failed, proceed anyway */ }
  }
  sendKeys(data.target, data.text)
    .then(() => {
      ws.send(JSON.stringify({ type: "sent", ok: true, target: data.target, text: data.text }));
      setTimeout(() => engine.pushCapture(ws), 300);
    })
    .catch(e => ws.send(JSON.stringify({ type: "error", error: e.message })));
};

const sleep: Handler = (ws, data) => {
  runAction(ws, "sleep", data.target, () => sendKeys(data.target, "\x03")); // Ctrl+C
};

const stop: Handler = (ws, data) => {
  runAction(ws, "stop", data.target, () => tmux.killWindow(data.target));
};

// === Agent Wake (Session Launch) ===
const wake: Handler = (ws, data) => {
  const cmd = data.command || buildCommand(data.target?.split(":").pop() || "");
  runAction(ws, "wake", data.target, () => sendKeys(data.target, cmd + "\r"));
};

// === Fleet Wake (Batch agent creation) ===
const fleetWake: Handler = (ws, data) => {
  const session = data.session || data.target?.split(":")[0] || "";
  const oracle = data.oracle || session.replace(/^\d+-/, "");
  if (!oracle && !data.window) {
    ws.send(JSON.stringify({ type: "error", error: "no oracle name" }));
    return;
  }
  const resume = data.resume !== false; // default to resume
  const windowName: string | undefined = data.window;

  if (windowName) {
    // Single-window wake — create just this one tmux window
    runAction(ws, "fleet-wake", data.target || session, async () => {
      // Resolve repo path from fleet config
      let repoPath = "";
      try {
        const files = readdirSync(FLEET_DIR).filter(f => f.endsWith(".json") && !f.endsWith(".disabled"));
        for (const f of files) {
          try {
            const cfg = JSON.parse(readFileSync(join(FLEET_DIR, f), "utf-8"));
            if (cfg.name === session) {
              const win = (cfg.windows || []).find((w: any) => w.name === windowName);
              if (win?.repo) {
                const repoName = win.repo.split("/").pop();
                const ghq = Bun.spawn(["ghq", "list", "--full-path"], { stdout: "pipe", stderr: "pipe" });
                const out = await new Response(ghq.stdout).text();
                await ghq.exited;
                repoPath = out.split("\n").find(l => l.endsWith("/" + repoName))?.trim() || "";
              }
              break;
            }
          } catch {}
        }
      } catch {}
      // ... create window and start Claude
    });
  }
};

// === Terminal UI Integration ===
const openTerminal: Handler = (ws, data) => {
  const session = (data.session || data.target?.split(":")[0] || "").replace(/-view$/, "").replace(/^maw-pty-\d+$/, "");
  runAction(ws, "open-terminal", session, async () => {
    // Check if WezTerm already has a window for this session — focus it
    try {
      const list = Bun.spawn(["wezterm", "cli", "list", "--format", "json"], { stdout: "pipe", stderr: "pipe" });
      const text = await new Response(list.stdout).text();
      await list.exited;
      const panes = JSON.parse(text);
      const existing = panes.find((p: any) => p.window_title === session || p.title === session);
      if (existing) {
        const focus = Bun.spawn(["wezterm", "cli", "activate-pane", "--pane-id", String(existing.pane_id)], { stdout: "ignore", stderr: "ignore" });
        await focus.exited;
        // Raise this specific window
        const windowTitle = existing.window_title || existing.title || session;
        Bun.spawn([import.meta.dir + "/../raise-window", windowTitle],
          { stdout: "ignore", stderr: "ignore", stdin: "ignore" }).unref?.();
        return;
      }
    } catch {}
    // Open new window via osascript
    const proc = Bun.spawn(["osascript", "-e",
      `do shell script "wezterm start -- tmux attach-session -t '${session}'"`
    ], { stdout: "ignore", stderr: "ignore", stdin: "ignore" });
    proc.unref?.();
  });
};
```

---

## 4. tmux Integration Layer

### `/private/tmp/maw-js/src/tmux.ts` — Typed tmux Wrapper

```typescript
export interface TmuxWindow {
  index: number;
  name: string;
  active: boolean;
  cwd?: string;
}

export interface TmuxSession {
  name: string;
  windows: TmuxWindow[];
}

// Shell quoting with safety
function q(s: string | number): string {
  const str = String(s);
  if (/^[a-zA-Z0-9_.:\-\/]+$/.test(str)) return str;
  return `'${str.replace(/'/g, "'\\''")}'`;
}

export class Tmux {
  private socket?: string;
  constructor(private host?: string, socket?: string) {
    this.socket = socket !== undefined ? socket : resolveSocket();
  }

  // Base runner — executes tmux via ssh
  async run(subcommand: string, ...args: (string | number)[]): Promise<string> {
    const socketFlag = this.socket ? `-S ${q(this.socket)} ` : "";
    const cmd = `tmux ${socketFlag}${subcommand} ${args.map(q).join(" ")} 2>/dev/null`;
    return ssh(cmd, this.host);
  }

  async tryRun(subcommand: string, ...args: (string | number)[]): Promise<string> {
    return this.run(subcommand, ...args).catch(() => "");
  }

  // === Sessions ===
  async listSessions(): Promise<TmuxSession[]> {
    const raw = await this.run("list-sessions", "-F", "#{session_name}");
    const sessions: TmuxSession[] = [];
    for (const s of raw.split("\n").filter(Boolean)) {
      const windows = await this.listWindows(s);
      sessions.push({ name: s, windows });
    }
    return sessions;
  }

  // List all windows across all sessions (single call)
  async listAll(): Promise<TmuxSession[]> {
    const raw = await this.run("list-windows", "-a", "-F",
      "#{session_name}|||#{window_index}|||#{window_name}|||#{window_active}|||#{pane_current_path}");
    const map = new Map<string, TmuxWindow[]>();
    for (const line of raw.split("\n").filter(Boolean)) {
      const [session, idx, name, active, cwd] = line.split("|||");
      if (!map.has(session)) map.set(session, []);
      map.get(session)!.push({ index: +idx, name, active: active === "1", cwd: cwd || undefined });
    }
    return [...map.entries()].map(([name, windows]) => ({ name, windows }));
  }

  async hasSession(name: string): Promise<boolean> {
    try {
      await this.run("has-session", "-t", name);
      return true;
    } catch {
      return false;
    }
  }

  async newSession(name: string, opts: {
    window?: string;
    cwd?: string;
    detached?: boolean;
    cols?: number;
    rows?: number;
  } = {}): Promise<void> {
    const args: (string | number)[] = [];
    if (opts.detached !== false) args.push("-d");
    args.push("-s", name);
    if (opts.window) args.push("-n", opts.window);
    if (opts.cwd) args.push("-c", opts.cwd);
    // Default to 80x24 for detached sessions (for consistent capture)
    const cols = opts.cols ?? 80;
    const rows = opts.rows ?? 24;
    args.push("-x", cols, "-y", rows);
    await this.run("new-session", ...args);
    await this.setOption(name, "renumber-windows", "on");
    // Prevent auto-resize of detached sessions
    await this.tryRun("set-option", "-g", "window-size", "manual");
    // Prevent auto-destroy when no client attached
    await this.tryRun("set-option", "-g", "destroy-unattached", "off");
  }

  // Grouped session (shares windows with parent, independent sizing)
  async newGroupedSession(parent: string, name: string, opts: {
    cols: number;
    rows: number;
    window?: string;
  }): Promise<void> {
    await this.run("new-session", "-d", "-t", parent, "-s", name, "-x", opts.cols, "-y", opts.rows);
    if (opts.window) await this.selectWindow(`${name}:${opts.window}`);
  }

  // === Windows ===
  async listWindows(session: string): Promise<TmuxWindow[]> {
    const raw = await this.run("list-windows", "-t", session, "-F", "#{window_index}:#{window_name}:#{window_active}");
    return raw.split("\n").filter(Boolean).map(w => {
      const [idx, name, active] = w.split(":");
      return { index: +idx, name, active: active === "1" };
    });
  }

  async newWindow(session: string, name: string, opts: { cwd?: string } = {}): Promise<void> {
    const args: (string | number)[] = ["-t", session, "-n", name];
    if (opts.cwd) args.push("-c", opts.cwd);
    await this.run("new-window", ...args);
  }

  async selectWindow(target: string): Promise<void> {
    await this.tryRun("select-window", "-t", target);
  }
}
```

---

## 5. SSH & Command Execution

### `/private/tmp/maw-js/src/ssh.ts` — Remote Command Transport

```typescript
const DEFAULT_HOST = process.env.MAW_HOST || loadConfig().host || "white.local";
const IS_LOCAL = DEFAULT_HOST === "local" || DEFAULT_HOST === "localhost";

export async function ssh(cmd: string, host = DEFAULT_HOST): Promise<string> {
  const local = host === "local" || host === "localhost" || IS_LOCAL;
  const args = local ? ["bash", "-c", cmd] : ["ssh", host, cmd];
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(err.trim() || `exit ${code}`);
  }
  return text.trim();
}

// Capture terminal pane with ANSI colors preserved
export async function capture(target: string, lines = 80, host?: string): Promise<string> {
  // -e preserves ANSI escape sequences (colors)
  // -S captures scroll-back
  // -J joins wrapped lines for proper reflow
  if (lines > 50) {
    return ssh(`${tmuxCmd()} capture-pane -t '${target}' -e -J -p -S -${lines} 2>/dev/null`, host);
  }
  return ssh(`${tmuxCmd()} capture-pane -t '${target}' -e -J -p 2>/dev/null | tail -${lines}`, host);
}

// Smart send with special key handling
export async function sendKeys(target: string, text: string, host?: string): Promise<void> {
  const SPECIAL_KEYS: Record<string, string> = {
    "\x1b": "Escape",
    "\x1b[A": "Up",
    "\x1b[B": "Down",
    "\x1b[C": "Right",
    "\x1b[D": "Left",
    "\r": "Enter",
    "\n": "Enter",
    "\b": "BSpace",
    "\x15": "C-u", // Ctrl+U (kill line)
  };

  if (SPECIAL_KEYS[text]) {
    await t.sendKeys(target, SPECIAL_KEYS[text]);
    return;
  }

  // Strip trailing \r or \n — Enter is appended separately
  const endsWithEnter = text.endsWith("\r") || text.endsWith("\n");
  const body = endsWithEnter ? text.slice(0, -1) : text;

  if (!body) {
    await t.sendKeys(target, "Enter");
    return;
  }

  if (body.startsWith("/")) {
    // Slash commands: send char-by-char for interactive tools (Claude Code)
    for (const ch of body) {
      await t.sendKeysLiteral(target, ch);
    }
    await t.sendKeys(target, "Enter");
  } else {
    // Regular text: use smart send (buffer for multiline/long, send-keys for short)
    await t.sendText(target, body);
  }
}
```

---

## 6. Federation & Peer Management

### `/private/tmp/maw-js/src/peers.ts` — Multi-Machine Orchestration

```typescript
export interface PeerStatus {
  url: string;
  reachable: boolean;
  latency?: number;
}

// Check if a peer is reachable
async function checkPeerReachable(url: string): Promise<{ reachable: boolean; latency: number }> {
  const start = Date.now();
  try {
    const res = await fetch(`${url}/api/sessions`, {
      method: "GET",
      signal: AbortSignal.timeout(5000)
    });
    const latency = Date.now() - start;
    return { reachable: res.ok, latency };
  } catch {
    return { reachable: false, latency: Date.now() - start };
  }
}

// Get peers from config
export function getPeers(): string[] {
  const config = loadConfig();
  return config.peers || [];
}

// Fetch sessions from a peer
async function fetchPeerSessions(url: string): Promise<Session[]> {
  try {
    const res = await fetch(`${url}/api/sessions`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// Merge local + peer sessions with source tags
export async function getAggregatedSessions(localSessions: Session[]): Promise<(Session & { source?: string })[]> {
  const peers = getPeers();
  if (peers.length === 0) {
    return localSessions;
  }

  const result: (Session & { source?: string })[] = localSessions.map(s => ({ ...s, source: "local" }));

  // Fetch sessions from all peers in parallel
  const peerResults = await Promise.all(peers.map(async (url) => {
    const sessions = await fetchPeerSessions(url);
    return sessions.map(s => ({ ...s, source: url }));
  }));

  return result.concat(...peerResults);
}

// Federation status — peer connectivity report
export async function getFederationStatus(): Promise<{
  localUrl: string;
  peers: PeerStatus[];
  totalPeers: number;
  reachablePeers: number;
}> {
  const config = loadConfig();
  const peers = getPeers();
  const port = config.port || 3456;
  const localUrl = `http://localhost:${port}`;

  const statuses = await Promise.all(peers.map(async (url) => {
    const { reachable, latency } = await checkPeerReachable(url);
    return { url, reachable, latency };
  }));

  const reachablePeers = statuses.filter(s => s.reachable).length;

  return {
    localUrl,
    peers: statuses,
    totalPeers: peers.length,
    reachablePeers,
  };
}

// Find which peer a target comes from
export async function findPeerForTarget(target: string, localSessions: Session[]): Promise<string | null> {
  const aggregated = await getAggregatedSessions(localSessions);
  const session = aggregated.find(s => s.name === target || s.windows.some(w => `${s.name}:${w.name}` === target));
  return session?.source === "local" ? null : (session?.source || null);
}

// Send keys to a target on a peer
export async function sendKeysToPeer(peerUrl: string, target: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${peerUrl}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, text }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

---

## 7. Terminal Capture & Streaming

### `/private/tmp/maw-js/src/engine.capture.ts` — Reactive Push Updates

```typescript
// Push terminal capture (high frequency, only on change)
export async function pushCapture(
  ws: MawWS,
  lastContent: Map<MawWS, string>,
) {
  if (!ws.data.target) return;
  try {
    await ensureMinWidth(ws.data.target);
    const content = await capture(ws.data.target, 80);
    const prev = lastContent.get(ws);
    if (content !== prev) {
      lastContent.set(ws, content);
      ws.send(JSON.stringify({ type: "capture", target: ws.data.target, content }));
    }
  } catch (e: any) {
    ws.send(JSON.stringify({ type: "error", error: e.message }));
  }
}

// Ensure pane is at least 80 cols wide (for consistent text wrapping)
async function ensureMinWidth(target: string, minCols = 80) {
  try {
    const proc = Bun.spawn(["bash", "-c", `tmux display -t '${target}' -p '#{pane_width}' 2>/dev/null`], { stdout: "pipe", stderr: "pipe" });
    const width = +(await new Response(proc.stdout).text()).trim();
    await proc.exited;
    if (width > 0 && width < minCols) {
      const winTarget = target.replace(/\.\d+$/, "");
      const resize = Bun.spawn(["bash", "-c", `tmux resize-window -t '${winTarget}' -x ${minCols} 2>/dev/null`], { stdout: "ignore", stderr: "ignore" });
      await resize.exited;
    }
  } catch {}
}

// Push preview captures (15 lines for status text)
export async function pushPreviews(
  ws: MawWS,
  lastPreviews: Map<MawWS, Map<string, string>>,
) {
  const targets = ws.data.previewTargets;
  if (!targets || targets.size === 0) return;
  const prevMap = lastPreviews.get(ws) || new Map<string, string>();
  const changed: Record<string, string> = {};
  let hasChanges = false;

  await Promise.allSettled([...targets].map(async (target) => {
    try {
      await ensureMinWidth(target);
      const content = await capture(target, 15);
      const prev = prevMap.get(target);
      if (content !== prev) {
        prevMap.set(target, content);
        changed[target] = content;
        hasChanges = true;
      }
    } catch {}
  }));

  lastPreviews.set(ws, prevMap);
  if (hasChanges) {
    ws.send(JSON.stringify({ type: "previews", data: changed }));
  }
}

// Broadcast session list (with ghost sessions from fleet configs)
export async function broadcastSessions(
  clients: Set<MawWS>,
  cache: { sessions: SessionInfo[]; json: string },
  peerSessions: SessionInfo[] = [],
): Promise<SessionInfo[]> {
  if (clients.size === 0) return cache.sessions;
  try {
    const raw = await tmux.listAll();
    // Filter to agent sessions (NN-name pattern: 01-firstgod, 08-zeus)
    const local: SessionInfo[] = raw.filter(s => /^\d{2}-/.test(s.name));

    // Inject ghost sessions for fleet configs not yet running
    try {
      const files = readdirSync(FLEET_DIR).filter(f => f.endsWith(".json") && !f.endsWith(".disabled"));
      for (const f of files) {
        try {
          const config = JSON.parse(readFileSync(join(FLEET_DIR, f), "utf-8"));
          if (!config.name || !/^\d{2}-/.test(config.name)) continue;
          const existing = local.find(s => s.name === config.name);
          if (!existing) {
            // Session not running — inject full ghost session
            local.push({
              name: config.name,
              windows: (config.windows || []).map((w: any) => ({
                index: 0,
                name: w.name,
                active: false,
              })),
              ghost: true,
            });
          }
        } catch {}
      }
    } catch {}

    // Append peer sessions
    const all = [...local, ...peerSessions];
    const json = JSON.stringify(all);
    if (json !== cache.json) {
      cache.json = json;
      cache.sessions = all;
      for (const ws of clients) {
        ws.send(JSON.stringify({ type: "sessions", sessions: all }));
      }
    }
    return local;
  } catch {
    return cache.sessions;
  }
}
```

---

## 8. HTTP Server Setup

### `/private/tmp/maw-js/src/server.ts` — Hono REST API + WebSocket

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";

const app = new Hono();
app.use("/api/*", async (c, next) => {
  await next();
  c.header("Access-Control-Allow-Private-Network", "true");
});
app.use("/api/*", cors());

// === API Routes ===

app.get("/api/sessions", async (c) => {
  const local = await listSessions();
  // Filter out view/pty sessions (temporary attach sessions)
  const filtered = local.filter(s => !s.name.includes("-view") && !s.name.startsWith("maw-pty-"));
  const aggregated = await getAggregatedSessions(filtered);
  return c.json(aggregated);
});

app.get("/api/capture", async (c) => {
  const target = c.req.query("target");
  if (!target) return c.json({ error: "target required" }, 400);
  try {
    const lines = +(c.req.query("lines") || "80");
    const cols = +(c.req.query("cols") || "0");
    // Auto-resize pane to match popup width
    if (cols >= 40) {
      try {
        const curWidth = await ssh(`tmux display -t '${target}' -p '#{pane_width}' 2>/dev/null`);
        if (+curWidth !== cols) {
          const winTarget = target.replace(/\.\d+$/, "");
          await ssh(`tmux resize-window -t '${winTarget}' -x ${cols} 2>/dev/null`);
        }
      } catch {}
    }
    return c.json({ content: await capture(target, lines) });
  } catch (e: any) {
    return c.json({ content: "", error: e.message });
  }
});

app.post("/api/send", async (c) => {
  const { target, text } = await c.req.json();
  if (!target || !text) return c.json({ error: "target and text required" }, 400);

  // Check if target is on a peer
  const local = await listSessions();
  const peerUrl = await findPeerForTarget(target, local);

  if (peerUrl) {
    // Route to peer
    const ok = await sendKeysToPeer(peerUrl, target, text);
    if (ok) return c.json({ ok: true, target, text, source: peerUrl });
    return c.json({ error: "Failed to send to peer", target, source: peerUrl }, 502);
  }

  // Send locally
  await sendKeys(target, text);
  return c.json({ ok: true, target, text, source: "local" });
});

app.post("/api/select", async (c) => {
  const { target } = await c.req.json();
  if (!target) return c.json({ error: "target required" }, 400);
  await selectWindow(target);
  return c.json({ ok: true, target });
});

// Federation status
app.get("/api/federation/status", async (c) => {
  const status = await getFederationStatus();
  return c.json(status);
});

// === Static Files & SPAs ===
// Main React app
app.get("/", serveStatic({ root: `${MAW_ROOT}/dist-office`, path: "/index.html" }));
app.get("/assets/*", serveStatic({ root: `${MAW_ROOT}/dist-office` }));

// Legacy redirects
app.get("/dashboard", (c) => c.redirect("/#orbital"));
app.get("/office", (c) => c.redirect("/#office"));

// Alternative UIs (Bevy WASM)
app.get("/office-8bit", serveStatic({ root: `${MAW_ROOT}/dist-8bit-office`, path: "/index.html" }));
app.get("/war-room", serveStatic({ root: `${MAW_ROOT}/dist-war-room`, path: "/index.html" }));
app.get("/race-track", serveStatic({ root: `${MAW_ROOT}/dist-race-track`, path: "/index.html" }));
app.get("/superman", serveStatic({ root: `${MAW_ROOT}/dist-superman`, path: "/index.html" }));

// Oracle proxy routes (search, stats, projects)
app.get("/api/oracle/search", async (c) => {
  const q = c.req.query("q");
  if (!q) return c.json({ error: "q required" }, 400);
  const params = new URLSearchParams({ q, mode: c.req.query("mode") || "hybrid", limit: c.req.query("limit") || "10" });
  try {
    const res = await fetch(`${ORACLE_URL}/api/search?${params}`);
    return c.json(await res.json());
  } catch (e: any) {
    return c.json({ error: `Oracle unreachable: ${e.message}` }, 502);
  }
});

// === UI State & Persistence ===
app.get("/api/ui-state", (c) => {
  try {
    if (!existsSync(uiStatePath)) return c.json({});
    return c.json(JSON.parse(readFileSync(uiStatePath, "utf-8")));
  } catch {
    return c.json({});
  }
});

app.post("/api/ui-state", async (c) => {
  try {
    const body = await c.req.json();
    writeFileSync(uiStatePath, JSON.stringify(body, null, 2), "utf-8");
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});
```

---

## 9. Agent Wake & Session Management

### `/private/tmp/maw-js/src/commands/wake.ts` — Session Startup & Resume

```typescript
import { ssh } from "../ssh";
import { tmux } from "../tmux";
import { loadConfig, buildCommand, getEnvVars } from "../config";

/** Log wake event to maw-log.jsonl for auto-sleep tracking */
function logWakeEvent(oracle: string) {
  const logDir = join(homedir(), ".oracle");
  const logFile = join(logDir, "maw-log.jsonl");
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    type: "wake",
    oracle,
  }) + "\n";
  try {
    mkdirSync(logDir, { recursive: true });
    appendFileSync(logFile, line);
  } catch {}
}

/** Build command with --continue flag to resume last session */
function buildResumeCommand(agentName: string): string {
  const base = buildCommand(agentName);
  if (base.includes("--continue")) return base;

  const prefix = "command -v direnv >/dev/null && direnv allow . && eval \"$(direnv export zsh)\"; unset CLAUDECODE 2>/dev/null;";
  const cmdPart = base.replace(prefix, "").trim();
  return `${prefix} ${cmdPart} --continue || ${prefix} ${cmdPart}`;
}

/**
 * Verify all windows in a session are running Claude (not empty zsh).
 * Retries buildCommand for any still on shell prompt.
 */
export async function ensureSessionRunning(session: string): Promise<number> {
  let retried = 0;
  let windows: { index: number; name: string; active: boolean }[];
  try {
    windows = await tmux.listWindows(session);
  } catch { return 0; }

  const targets = windows.map(w => `${session}:${w.name}`);

  // Batch-check running commands
  const commands = await getPaneCommands(targets);

  for (const target of targets) {
    const cmd = commands[target] || "";
    if (!/claude|codex|node/i.test(cmd)) {
      // Retry with fresh command
      const windowName = target.split(":")[1];
      const newCmd = buildResumeCommand(windowName);
      await sendKeys(target, newCmd + "\r");
      retried++;
    }
  }
  return retried;
}
```

---

## 10. Team & Agent Status Detection

### `/private/tmp/maw-js/src/engine.teams.ts` — Liveness Detection

```typescript
interface TeamData {
  name: string;
  description: string;
  members: any[];
  tasks: any[];
  alive: boolean;
}

const TEAMS_DIR = join(homedir(), ".claude/teams");
const TASKS_DIR = join(homedir(), ".claude/tasks");

/** Get all live tmux pane IDs */
function livePaneIds(): Set<string> {
  try {
    const raw = execSync("tmux list-panes -a -F '#{pane_id}'", { encoding: "utf-8", timeout: 2000 });
    return new Set(raw.split("\n").filter(Boolean));
  } catch { return new Set(); }
}

/** Check if a team has any alive members */
function isTeamAlive(members: any[], panes: Set<string>): boolean {
  for (const m of members) {
    // tmux-mode: check if pane exists
    if (m.backendType === "tmux" && m.tmuxPaneId && panes.has(m.tmuxPaneId)) return true;
    // in-process: check if cwd is on this machine (not /Users/ on a Linux box)
    if (m.backendType === "in-process" && m.cwd) {
      const isLocal = m.cwd.startsWith(homedir());
      if (!isLocal) continue; // remote/MBA leftover
      // Heuristic: Claude session created < 2h ago
      if (m.joinedAt && Date.now() - m.joinedAt < 2 * 60 * 60 * 1000) return true;
    }
    // Team lead with empty paneId: check locality + recency
    if (m.agentType === "team-lead" || m.name === "team-lead") {
      if (m.cwd && m.cwd.startsWith(homedir()) && m.joinedAt && Date.now() - m.joinedAt < 2 * 60 * 60 * 1000) return true;
    }
  }
  return false;
}

/** Scan all teams + tasks, return state with liveness */
export function scanTeams(): TeamData[] {
  try {
    const dirs = readdirSync(TEAMS_DIR).filter(d =>
      existsSync(join(TEAMS_DIR, d, "config.json"))
    );
    const panes = livePaneIds();
    return dirs.map(d => {
      try {
        const config = JSON.parse(readFileSync(join(TEAMS_DIR, d, "config.json"), "utf-8"));
        const tasksDir = join(TASKS_DIR, d);
        let tasks: any[] = [];
        try {
          tasks = readdirSync(tasksDir)
            .filter(f => f.endsWith(".json"))
            .map(f => JSON.parse(readFileSync(join(tasksDir, f), "utf-8")));
        } catch {}

        const alive = isTeamAlive(config.members || [], panes);

        return {
          name: d,
          description: config.description || "",
          members: config.members || [],
          tasks,
          alive,
        };
      } catch {
        return { name: d, description: "", members: [], tasks: [], alive: false };
      }
    });
  } catch {
    return [];
  }
}
```

---

## 11. PTY Management & Scroll History

### `/private/tmp/maw-js/src/pty.ts` — Terminal Emulation Layer

```typescript
// Strip ANSI escape sequences
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
             .replace(/\x1b\][^\x07]*\x07/g, "")  // OSC sequences
             .replace(/\x1b[()][0-9A-B]/g, "")     // charset
             .replace(/\x1b\[[\?]?[0-9;]*[hlsr]/g, ""); // mode set/reset
}

/** Check if a line is mostly decorative (dots, box-drawing, braille)
 *  These come from Claude Code's TUI and clutter scroll history. */
function isDecorativeLine(line: string): boolean {
  const content = line.replace(/[\u00B7\u2022\u2024-\u2027\u2219\u22C5\u25CF\u25CB\u2500-\u257F\u2580-\u259F\u2800-\u28FF\u2E31─━═—\-_▁▔·•∙⋅⋯…│├└╰╭╮╯╰┌┐┘└┬┤┴┼▶▷▸▹►▼▽▾▿◆◇○●◌◐◑◒◓⠀-⣿.\s]/g, "");
  const trimmed = line.trim();
  if (trimmed.length === 0) return true;
  return content.length < trimmed.length * 0.2;
}

/** Periodically captures tmux pane content as plain text for scroll history */
class ScrollHistory {
  private lines: string[] = [];
  private maxLines: number;
  private lastCapture = "";

  constructor(maxLines = 5000) {
    this.maxLines = maxLines;
  }

  /** Add a new screen capture — only appends new lines */
  addCapture(content: string) {
    const plain = stripAnsi(content);
    if (plain === this.lastCapture) return; // No change
    this.lastCapture = plain;

    // Extract non-empty lines, filter decorative TUI lines
    const newLines = plain.split("\n").filter(l => l.trim() && !isDecorativeLine(l));
    if (newLines.length === 0) return;

    // Append
    this.lines.push(...newLines);

    // Trim oldest if over limit
    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(-this.maxLines);
    }
  }

  /** Get all history as string with \r\n line endings */
  getHistory(): string {
    if (this.lines.length === 0) return "";
    return this.lines.join("\r\n") + "\r\n";
  }

  get size() { return this.lines.length; }
}

interface PtySession {
  proc: ReturnType<typeof Bun.spawn>;
  target: string;
  ptySessionName: string;
  cols: number;
  rows: number;
  viewers: Set<ServerWebSocket<any>>;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  scrollHistory: ScrollHistory;
  captureInterval: ReturnType<typeof setInterval> | null;
}

const sessions = new Map<string, PtySession>();

export function handlePtyMessage(ws: ServerWebSocket<any>, msg: string | Buffer) {
  if (typeof msg !== "string") {
    // Binary → keystroke to PTY stdin
    const session = findSession(ws);
    if (session?.proc.stdin) {
      session.proc.stdin.write(msg as Buffer);
      session.proc.stdin.flush();
    }
    return;
  }

  // JSON control message
  try {
    const data = JSON.parse(msg);
    if (data.type === "attach") attach(ws, data.target, data.cols || 120, data.rows || 40);
    else if (data.type === "resize") resize(ws, data.cols, data.rows);
    // ... other control messages
  } catch {}
}
```

---

## 12. Federation Status & Peer Diagnostics

### `/private/tmp/maw-js/src/commands/federation.ts` — Federation Monitoring

```typescript
import { getFederationStatus, getPeers } from "../peers";

async function fetchPeerAgentCount(url: string): Promise<number> {
  try {
    const res = await fetch(`${url}/api/sessions`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return 0;
    const sessions: { windows: unknown[] }[] = await res.json();
    return sessions.reduce((n, s) => n + (s.windows?.length || 0), 0);
  } catch {
    return 0;
  }
}

/** maw federation status — show peer connectivity + agent counts */
export async function cmdFederationStatus() {
  const peers = getPeers();

  if (peers.length === 0) {
    console.log("\x1b[90mNo peers configured. Add peers[] to maw.config.json.\x1b[0m");
    console.log('\x1b[90mExample: { "peers": ["http://other-host:3456"] }\x1b[0m');
    return;
  }

  console.log(`\n\x1b[36;1mFederation Status\x1b[0m  \x1b[90m${peers.length} peer${peers.length !== 1 ? "s" : ""} configured\x1b[0m\n`);

  const { peers: statuses, localUrl } = await getFederationStatus();

  // Fetch agent counts in parallel for online peers
  const counts = await Promise.all(
    statuses.map(p => p.reachable ? fetchPeerAgentCount(p.url) : Promise.resolve(0))
  );

  let online = 0;
  for (let i = 0; i < statuses.length; i++) {
    const { url, reachable, latency } = statuses[i];
    const agentCount = counts[i];
    if (reachable) online++;

    const dot = reachable ? "\x1b[32m●\x1b[0m" : "\x1b[31m●\x1b[0m";
    const status = reachable
      ? `\x1b[32monline\x1b[0m  \x1b[90m${latency}ms · ${agentCount} agent${agentCount !== 1 ? "s" : ""}\x1b[0m`
      : "\x1b[31moffline\x1b[0m";

    let label: string;
    try {
      const u = new URL(url);
      label = u.hostname === "localhost" || u.hostname === "127.0.0.1"
        ? `localhost:${u.port}` : u.host;
    } catch { label = url; }

    console.log(`  ${dot}  \x1b[37m${label}\x1b[0m  ${status}`);
    console.log(`     \x1b[90m${url}\x1b[0m`);
  }

  console.log(`\n\x1b[90m${online}/${peers.length} online · local: ${localUrl}\x1b[0m\n`);
}
```

---

## Key Design Patterns

### 1. **Change Detection via Content Hashing**
Instead of always pushing updates, the engine caches last content and only sends when changed:
```typescript
const prev = lastContent.get(ws);
if (content !== prev) {
  lastContent.set(ws, content);
  ws.send(...); // Only send if different
}
```

### 2. **Polling Intervals for Real-time Data**
Multiple background intervals keep clients in sync:
- 50ms: Terminal capture (high-frequency UI updates)
- 2s: Preview panes (status indicators)
- 3s: Status detection, team liveness
- 5s: Session list, Oracle chat
- 10s: Peer sessions (federation)

### 3. **SSH Abstraction for Remote Control**
All tmux commands are abstracted through an `ssh()` function that handles both local bash and remote SSH:
```typescript
const args = local ? ["bash", "-c", cmd] : ["ssh", host, cmd];
```

### 4. **Peer Federation via HTTP**
Agents can be controlled across multiple machines by:
1. Detecting which peer owns a target (via aggregated session list)
2. Routing control messages to `/api/send` on the peer
3. Each peer proxies to its local tmux instance

### 5. **Smart Command Sending**
Special handling for different input types:
- Special keys (Escape, Enter, etc.) → tmux key names
- Slash commands (from Claude Code) → char-by-char for interactivity
- Regular text → smart buffer vs. send-keys based on length

### 6. **Ghost Sessions from Fleet Config**
Sessions defined in fleet configs but not yet running appear as "ghost" sessions in the UI, allowing users to wake them on demand.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (React + Zustand)             │
│  (office, 8-bit-office, war-room, race-track, superman) │
└────────────────────┬────────────────────────────────────┘
                     │ WebSocket + REST
                     ▼
┌─────────────────────────────────────────────────────────┐
│        HTTP Server (Hono) + WebSocket Engine            │
│                   src/server.ts                         │
└────┬─────────────────────────┬──────────────────────┬───┘
     │                         │                      │
     ▼                         ▼                      ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   MawEngine  │      │  REST Routes │      │  Peer URLs   │
│  (handlers)  │      │  (API proxy) │      │(federation)  │
└──────┬───────┘      └──────────────┘      └──────┬───────┘
       │                                           │
       │ polls                                    │ proxy
       │ every 50-5000ms                         │ commands
       │                                           │
       ▼                                           ▼
┌─────────────────────────────────────────────────────────┐
│              SSH Transport Layer                        │
│    (local bash or remote SSH to machines)              │
└────────────┬────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│                     tmux (local)                        │
│   Sessions: 01-nova, 02-alex, 03-zeus, 04-hermes...   │
│   Each session: multiple windows (Claude sessions)     │
└─────────────────────────────────────────────────────────┘
```

---

**Total Source Files**: 43 TypeScript files
**Key Technologies**: Bun (runtime), Hono (HTTP), Zustand (state), WebSocket (realtime), tmux (process management)
