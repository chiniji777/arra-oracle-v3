/**
 * Fleet Status Route — /api/fleet/status
 * PRJ-007: Read fleet configs + cross-reference tmux sessions
 */

import type { Hono } from 'hono';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { HOME_DIR } from '../config.ts';

const CLAUDE_PROJECTS_DIR = join(HOME_DIR, '.claude', 'projects');
const GHQ_BASE = join(HOME_DIR, 'ghq', 'github.com');
const MAX_CONTEXT_TOKENS = 200_000;

const FLEET_DIR = join(HOME_DIR, '.config', 'maw', 'fleet');

interface FleetConfig {
  name: string;
  windows: { name: string; repo?: string }[];
  env?: { ORACLE_GROUP?: string; ORACLE_ROLE?: string };
}

function getTmuxSessions(): string[] {
  try {
    const proc = Bun.spawnSync(['tmux', 'list-sessions', '-F', '#{session_name}']);
    if (proc.exitCode !== 0) return [];
    return proc.stdout.toString().trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/** Read and parse all fleet config files */
export function readFleetConfigs(): FleetConfig[] {
  let files: string[];
  try {
    files = readdirSync(FLEET_DIR).filter(f => f.endsWith('.json'));
  } catch {
    return [];
  }

  const configs: FleetConfig[] = [];
  for (const f of files) {
    try {
      const raw = readFileSync(join(FLEET_DIR, f), 'utf-8');
      configs.push(JSON.parse(raw));
    } catch (e) {
      console.warn(`⚠️ fleet: skipping ${f} — ${e instanceof Error ? e.message : e}`);
    }
  }
  return configs;
}

/** Count total agents across all fleet configs */
export function getFleetAgentCount(): number {
  const configs = readFleetConfigs();
  return configs.reduce((sum, cfg) => sum + cfg.windows.length, 0);
}

// Agent-to-group mapping (mirrors frontend OLYMPUS_GROUPS)
const AGENT_GROUPS: Record<string, string> = {
  'firstgod': 'olympus', 'saraswati': 'olympus',
  'athena': 'assistant', 'hermes': 'assistant', 'nova': 'assistant',
  'freya': 'alpha', 'hades': 'alpha', 'anubis': 'alpha', 'thor': 'alpha', 'ra': 'alpha',
  'amaterasu': 'beta', 'shiva': 'beta', 'indra': 'beta', 'ember': 'beta', 'odin': 'beta',
  'zeus': 'solo', 'apollo': 'solo', 'ganesh': 'solo',
};

// Patterns indicating an agent is actively working
const BUSY_PATTERNS = [
  'Thinking', '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏', // spinner chars
  'Running', 'Editing', 'Reading', 'Writing', 'Searching',
  'tool:', 'Tool:', '│', // tool call output borders
  'Created file', 'Updated file', 'Deleted file',
];

// Patterns indicating agent is idle / waiting for input
const IDLE_PATTERNS = [
  '❯', '> ', '$ ', 'What would you like to do',
  'Type a message', 'How can I help',
];

function getAgentWindows(): { session: string; window: string; target: string }[] {
  const results: { session: string; window: string; target: string }[] = [];
  const sessions = getTmuxSessions();
  for (const session of sessions) {
    try {
      const proc = Bun.spawnSync(['tmux', 'list-windows', '-t', session, '-F', '#{window_name}']);
      if (proc.exitCode !== 0) continue;
      const windows = proc.stdout.toString().trim().split('\n').filter(Boolean);
      for (const win of windows) {
        results.push({ session, window: win, target: `${session}:${win}` });
      }
    } catch {
      continue;
    }
  }
  return results;
}

function capturePaneContent(target: string, lines: number = 15): string {
  try {
    const proc = Bun.spawnSync(['tmux', 'capture-pane', '-t', target, '-p', '-S', `-${lines}`]);
    if (proc.exitCode !== 0) return '';
    return proc.stdout.toString();
  } catch {
    return '';
  }
}

function detectAgentStatus(paneContent: string): 'free' | 'busy' {
  if (!paneContent.trim()) return 'free';

  // Check last few lines for activity
  const lines = paneContent.split('\n').filter(l => l.trim());
  const recentLines = lines.slice(-5).join('\n');

  for (const pattern of BUSY_PATTERNS) {
    if (recentLines.includes(pattern)) return 'busy';
  }

  for (const pattern of IDLE_PATTERNS) {
    if (recentLines.includes(pattern)) return 'free';
  }

  // Default: if there's recent output but no clear signal, assume busy
  return lines.length > 3 ? 'busy' : 'free';
}

export interface AgentAvailability {
  name: string;
  group: string;
  session: string;
  status: 'free' | 'busy' | 'offline';
}

/** Get all agents with their current availability status */
export function getAgentsAvailability(): AgentAvailability[] {
  const configs = readFleetConfigs();
  const activeSessions = getTmuxSessions();
  const agentWindows = getAgentWindows();

  const agents: AgentAvailability[] = [];

  for (const cfg of configs) {
    const isOnline = activeSessions.includes(cfg.name);

    for (const win of cfg.windows) {
      const agentName = win.name.replace('-oracle', '');
      if (agentName === 'firstgod' || agentName === 'saraswati') continue;

      if (!isOnline) {
        agents.push({
          name: agentName,
          group: AGENT_GROUPS[agentName] || cfg.env?.ORACLE_GROUP || 'unknown',
          session: cfg.name,
          status: 'offline',
        });
        continue;
      }

      const match = agentWindows.find(w => w.session === cfg.name && w.window === win.name);
      if (!match) {
        agents.push({
          name: agentName,
          group: AGENT_GROUPS[agentName] || cfg.env?.ORACLE_GROUP || 'unknown',
          session: cfg.name,
          status: 'offline',
        });
        continue;
      }

      const content = capturePaneContent(match.target);
      const status = detectAgentStatus(content);

      agents.push({
        name: agentName,
        group: AGENT_GROUPS[agentName] || cfg.env?.ORACLE_GROUP || 'unknown',
        session: cfg.name,
        status,
      });
    }
  }

  return agents;
}

/** Pick a free QA agent that is NOT the given agent */
// Station QA agents: anubis (alpha), indra (beta)
const STATION_QA: Record<string, string> = {
  'alpha': 'anubis',
  'beta': 'indra',
};

export function pickQaAgent(excludeAgent: string): AgentAvailability | null {
  const agents = getAgentsAvailability();

  // Pick QA from the same station as the coder
  const coderGroup = AGENT_GROUPS[excludeAgent];
  const stationQa = STATION_QA[coderGroup];
  if (stationQa && stationQa !== excludeAgent) {
    const qa = agents.find(a => a.name === stationQa && a.status !== 'offline');
    if (qa) return qa;
  }

  // Fallback: QA from the other station
  const otherQa = agents.find(a => (a.name === 'anubis' || a.name === 'indra') && a.name !== excludeAgent && a.status !== 'offline');
  if (otherQa) return otherQa;

  // Last resort: any online agent that's not the coder
  const anyOnline = agents.find(a => a.status !== 'offline' && a.name !== excludeAgent);
  return anyOnline || null;
}

// ── Agent Context % from JSONL session files ──────────────────────

export interface AgentContext {
  name: string;
  group: string;
  contextPercent: number;
  totalTokens: number;
  lastActivity: string | null; // ISO timestamp
}

/** Convert fleet repo (e.g. "chiniji777/hermes-oracle") to .claude/projects encoded dir name */
function repoToProjectDir(repo: string): string {
  const repoPath = join(GHQ_BASE, repo);
  // Claude Code encodes paths: /Users/tanawat/ghq/github.com/... → -Users-tanawat-ghq-github-com-...
  // Both / and . are replaced with -
  return repoPath.replace(/^\//, '-').replace(/[/.]/g, '-');
}

/** Find the latest .jsonl session file in a project dir */
function findLatestSession(encodedDir: string): string | null {
  const dir = join(CLAUDE_PROJECTS_DIR, encodedDir);
  if (!existsSync(dir)) return null;
  try {
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length > 0 ? join(dir, files[0].name) : null;
  } catch {
    return null;
  }
}

/** Parse the last assistant message's usage from a JSONL file */
function getSessionContext(jsonlPath: string): { totalTokens: number; contextPercent: number; lastActivity: string | null } {
  try {
    const content = readFileSync(jsonlPath, 'utf-8');
    const lines = content.trim().split('\n');

    let lastUsage: { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } | null = null;
    let lastTimestamp: string | null = null;

    // Parse from the end for efficiency
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const d = JSON.parse(lines[i]);
        if (d.type === 'assistant' && d.message?.usage) {
          lastUsage = d.message.usage;
          lastTimestamp = d.timestamp || null;
          break;
        }
      } catch { /* skip malformed lines */ }
    }

    if (!lastUsage) return { totalTokens: 0, contextPercent: 0, lastActivity: null };

    const total = (lastUsage.input_tokens || 0)
      + (lastUsage.cache_creation_input_tokens || 0)
      + (lastUsage.cache_read_input_tokens || 0);

    return {
      totalTokens: total,
      contextPercent: Math.round((total / MAX_CONTEXT_TOKENS) * 100),
      lastActivity: lastTimestamp,
    };
  } catch {
    return { totalTokens: 0, contextPercent: 0, lastActivity: null };
  }
}

/** Get context % for all fleet agents */
export function getAgentsContext(): AgentContext[] {
  const configs = readFleetConfigs();
  const results: AgentContext[] = [];

  for (const cfg of configs) {
    for (const win of cfg.windows) {
      const agentName = win.name.replace('-oracle', '');
      const repo = win.repo;
      if (!repo) continue;

      const encodedDir = repoToProjectDir(repo);
      const sessionFile = findLatestSession(encodedDir);

      if (!sessionFile) {
        results.push({
          name: agentName,
          group: AGENT_GROUPS[agentName] || cfg.env?.ORACLE_GROUP || 'unknown',
          contextPercent: 0,
          totalTokens: 0,
          lastActivity: null,
        });
        continue;
      }

      const ctx = getSessionContext(sessionFile);
      results.push({
        name: agentName,
        group: AGENT_GROUPS[agentName] || cfg.env?.ORACLE_GROUP || 'unknown',
        ...ctx,
      });
    }
  }

  return results;
}

// ── Core agent status (alive = tmux window exists) ──────────────────
const CORE_AGENTS = ['firstgod', 'saraswati', 'iris', 'athena', 'hermes', 'nova'];
const CORE_SESSION = '00-core';

export interface CoreAgentStatus {
  name: string;
  alive: boolean;
}

export function getCoreAgentStatuses(): CoreAgentStatus[] {
  const windows = getAgentWindows();
  return CORE_AGENTS.map(name => ({
    name,
    alive: windows.some(w => w.session === CORE_SESSION && w.window.replace('-oracle', '') === name),
  }));
}

export function registerFleetStatusRoutes(app: Hono) {
  // ── Core agents status ────────────────────────────────────────────
  app.get('/api/fleet/core', (c) => {
    return c.json({ agents: getCoreAgentStatuses(), timestamp: Date.now() });
  });

  // ── Sleep/Wake agent ──────────────────────────────────────────────
  app.post('/api/fleet/core/:name/sleep', (c) => {
    const name = c.req.param('name');
    if (!CORE_AGENTS.includes(name)) return c.json({ error: 'Not a core agent' }, 400);
    try {
      const proc = Bun.spawnSync(['maw', 'sleep', name]);
      return c.json({ ok: proc.exitCode === 0, agent: name, action: 'sleep' });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  });

  app.post('/api/fleet/core/:name/wake', (c) => {
    const name = c.req.param('name');
    if (!CORE_AGENTS.includes(name)) return c.json({ error: 'Not a core agent' }, 400);
    try {
      const proc = Bun.spawnSync(['maw', 'wake', name]);
      return c.json({ ok: proc.exitCode === 0, agent: name, action: 'wake' });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  });

  // ── Agent availability for project assignment ────────────────────
  app.get('/api/fleet/agents/availability', (c) => {
    const agents = getAgentsAvailability();
    return c.json({ agents, timestamp: Date.now() });
  });

  // ── Agent context window usage ────────────────────────────────────
  app.get('/api/fleet/agents/context', (c) => {
    const agents = getAgentsContext();
    return c.json({ agents, maxTokens: MAX_CONTEXT_TOKENS, timestamp: Date.now() });
  });

  app.get('/api/fleet/status', (c) => {
    const configs = readFleetConfigs();
    if (configs.length === 0) {
      return c.json({ error: 'Fleet config directory not found or empty', path: FLEET_DIR }, 500);
    }

    // Get tmux sessions
    const sessions = getTmuxSessions();

    // Cross-reference
    const rooms = configs.map(cfg => ({
      name: cfg.name,
      group: cfg.env?.ORACLE_GROUP || 'unknown',
      agents: cfg.windows.map(w => w.name),
      status: sessions.includes(cfg.name) ? 'online' as const : 'offline' as const,
    }));

    const totalAgents = rooms.reduce((sum, r) => sum + r.agents.length, 0);
    const onlineRooms = rooms.filter(r => r.status === 'online').length;
    const offlineRooms = rooms.filter(r => r.status === 'offline').length;

    return c.json({
      rooms,
      totalAgents,
      onlineRooms,
      offlineRooms,
      timestamp: Date.now(),
    });
  });
}
