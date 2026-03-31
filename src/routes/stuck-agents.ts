/**
 * Stuck Agents Route — /api/fleet/stuck
 * Scans tmux panes for agents waiting on human input (permission prompts, surveys, etc.)
 */

import type { Hono } from 'hono';

const STUCK_PATTERNS = [
  { pattern: 'Do you want to proceed', label: 'Permission prompt' },
  { pattern: 'Command contains', label: 'Permission prompt' },
  { pattern: 'Tab to amend', label: 'Permission prompt' },
];

// Auto-dismiss patterns (not shown to user, handled automatically)
const AUTO_DISMISS_PATTERNS = [
  { pattern: 'How is Claude doing', keys: '0' },
  { pattern: '1: Bad    2: Fine   3: Good', keys: '0' },
];

const SESSIONS = [
  '01-olympus', '02-assistant', '03-frontend', '04-execution',
  '05-qa', '06-backend', '07-data', '08-leadership', '09-debug',
];

interface StuckAgent {
  agent: string;
  session: string;
  window: string;
  target: string;
  reason: string;
  label: string;
  detectedAt: number;
}

function getAgentWindows(): { session: string; window: string; target: string }[] {
  const results: { session: string; window: string; target: string }[] = [];
  for (const session of SESSIONS) {
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

function sendToPane(target: string, keys: string): boolean {
  try {
    const proc = Bun.spawnSync(['tmux', 'send-keys', '-t', target, keys, 'Enter']);
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

function scanStuckAgents(): StuckAgent[] {
  const stuck: StuckAgent[] = [];
  const windows = getAgentWindows();

  for (const { session, window: win, target } of windows) {
    // Skip FirstGod (that's us / the operator)
    if (win === 'firstgod-oracle') continue;

    const content = capturePaneContent(target);
    if (!content) continue;

    // Auto-dismiss surveys/feedback prompts silently
    for (const { pattern, keys } of AUTO_DISMISS_PATTERNS) {
      if (content.includes(pattern)) {
        sendToPane(target, keys);
        break;
      }
    }

    for (const { pattern, label } of STUCK_PATTERNS) {
      if (content.includes(pattern)) {
        // Extract the matching line
        const lines = content.split('\n');
        const matchLine = lines.find(l => l.includes(pattern))?.trim() || pattern;

        stuck.push({
          agent: win.replace('-oracle', ''),
          session,
          window: win,
          target,
          reason: matchLine.slice(0, 120),
          label,
          detectedAt: Date.now(),
        });
        break; // one alert per agent
      }
    }
  }

  return stuck;
}

export function registerStuckAgentsRoutes(app: Hono) {
  // GET /api/fleet/stuck — scan for stuck agents
  app.get('/api/fleet/stuck', (c) => {
    const stuck = scanStuckAgents();
    return c.json({
      stuckAgents: stuck,
      totalStuck: stuck.length,
      timestamp: Date.now(),
    });
  });

  // POST /api/fleet/stuck/:agent/approve — auto-approve a stuck agent
  app.post('/api/fleet/stuck/:agent/approve', (c) => {
    const agentName = c.req.param('agent');
    const windows = getAgentWindows();
    const match = windows.find(w => w.window === `${agentName}-oracle`);

    if (!match) {
      return c.json({ error: `Agent '${agentName}' not found` }, 404);
    }

    const content = capturePaneContent(match.target);

    // Determine what to send based on the prompt type
    if (content.includes('How is Claude doing') || content.includes('1: Bad')) {
      sendToPane(match.target, '0'); // Dismiss survey
      return c.json({ ok: true, action: 'dismissed_survey', agent: agentName });
    }

    if (content.includes('Do you want to proceed')) {
      sendToPane(match.target, 'y'); // Approve
      return c.json({ ok: true, action: 'approved_permission', agent: agentName });
    }

    // Check for numbered selection (❯ 1. Yes)
    if (content.includes('1. Yes')) {
      sendToPane(match.target, '1'); // Select Yes
      return c.json({ ok: true, action: 'selected_yes', agent: agentName });
    }

    return c.json({ error: 'No recognized prompt to approve', agent: agentName }, 400);
  });

  // POST /api/fleet/stuck/approve-all — approve all stuck agents
  app.post('/api/fleet/stuck/approve-all', (c) => {
    const stuck = scanStuckAgents();
    const results: { agent: string; action: string }[] = [];

    for (const s of stuck) {
      const content = capturePaneContent(s.target);

      if (content.includes('How is Claude doing') || content.includes('1: Bad')) {
        sendToPane(s.target, '0');
        results.push({ agent: s.agent, action: 'dismissed_survey' });
      } else if (content.includes('Do you want to proceed')) {
        sendToPane(s.target, 'y');
        results.push({ agent: s.agent, action: 'approved_permission' });
      } else if (content.includes('1. Yes')) {
        sendToPane(s.target, '1');
        results.push({ agent: s.agent, action: 'selected_yes' });
      }
    }

    return c.json({ ok: true, approved: results, total: results.length });
  });
}
