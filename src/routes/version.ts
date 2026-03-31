/**
 * Version Route — /api/version
 * PRJ-015: Return app version, uptime, and name
 */

import type { Hono } from 'hono';

const pkg = await Bun.file(new URL('../../package.json', import.meta.url).pathname).json();
const startTime = Date.now();

export function registerVersionRoutes(app: Hono) {
  app.get('/api/version', (c) => {
    return c.json({
      version: pkg.version,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      name: pkg.name,
    });
  });
}
