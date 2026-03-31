/**
 * Ping Route — /api/ping
 * PRJ-005 Workflow Test endpoint
 * PRJ-012 Refactored: reads agent count from fleet configs
 */

import type { Hono } from 'hono';
import { getFleetAgentCount } from './fleet-status.ts';

export function registerPingRoutes(app: Hono) {
  app.get('/api/ping', (c) => {
    return c.json({
      status: 'ok',
      timestamp: Date.now(),
      agents: getFleetAgentCount(),
    });
  });
}
