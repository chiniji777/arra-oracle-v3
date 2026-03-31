/**
 * Hello Olympus Route — /api/hello-olympus
 * PRJ-002 Workflow Test endpoint
 */

import type { Hono } from 'hono';

export function registerHelloOlympusRoutes(app: Hono) {
  app.get('/api/hello-olympus', (c) => {
    return c.json({
      greeting: 'Hello from Olympus!',
      team: ['athena', 'hades', 'anubis'],
      timestamp: Date.now(),
    });
  });
}
