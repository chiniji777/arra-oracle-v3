/**
 * Test Workflow Route — /api/test-workflow
 * Workflow test endpoint from FirstGod via Station Model
 */

import type { Hono } from 'hono';

export function registerTestWorkflowRoutes(app: Hono) {
  app.get('/api/test-workflow', (c) => {
    return c.json({
      status: 'ok',
      message: 'Workflow Test — Station Model Active',
      station: 'Alpha',
      assignedTo: 'hades',
      timestamp: Date.now(),
    });
  });
}
