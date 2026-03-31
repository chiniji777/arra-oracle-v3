/**
 * Projects API Routes
 *
 * Track work processes assigned by Nut.
 * Agents check in, report work, and update progress automatically.
 */

import { Hono } from 'hono';
import { eq, desc, asc, sql } from 'drizzle-orm';
import { db, projects, projectTasks } from '../db/index.ts';
import { pickQaAgent } from './fleet-status.ts';

export function registerProjectRoutes(app: Hono) {

  // ── List all projects ──────────────────────────────────────────────
  app.get('/api/projects', (c) => {
    const status = c.req.query('status'); // filter by status

    let query;
    if (status) {
      query = db.select().from(projects)
        .where(eq(projects.status, status))
        .orderBy(desc(projects.updatedAt));
    } else {
      query = db.select().from(projects)
        .orderBy(desc(projects.updatedAt));
    }

    const rows = query.all();
    return c.json({ projects: rows });
  });

  // ── Get single project with tasks ──────────────────────────────────
  app.get('/api/projects/:id', (c) => {
    const id = c.req.param('id');

    const project = db.select().from(projects)
      .where(eq(projects.id, id))
      .get();

    if (!project) return c.json({ error: 'Project not found' }, 404);

    const tasks = db.select().from(projectTasks)
      .where(eq(projectTasks.projectId, id))
      .orderBy(asc(projectTasks.order), asc(projectTasks.createdAt))
      .all();

    return c.json({ project, tasks });
  });

  // ── Create a new project ───────────────────────────────────────────
  app.post('/api/projects', async (c) => {
    const body = await c.req.json();
    const { name, description } = body;

    if (!name) return c.json({ error: 'name is required' }, 400);

    // Generate project ID: PRJ-XXX
    const count = db.select({ count: sql<number>`count(*)` })
      .from(projects).get();
    const num = (count?.count || 0) + 1;
    const id = `PRJ-${String(num).padStart(3, '0')}`;

    const now = Date.now();
    db.insert(projects).values({
      id,
      name,
      description: description || null,
      status: 'active',
      assignedBy: body.assignedBy || 'nut',
      createdAt: now,
      updatedAt: now,
    }).run();

    return c.json({ id, name, status: 'active' }, 201);
  });

  // ── Update project status ──────────────────────────────────────────
  app.patch('/api/projects/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (body.name) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status) {
      updates.status = body.status;
      if (body.status === 'completed') updates.completedAt = Date.now();
    }

    db.update(projects)
      .set(updates)
      .where(eq(projects.id, id))
      .run();

    return c.json({ ok: true });
  });

  // ── Add task to project ────────────────────────────────────────────
  app.post('/api/projects/:id/tasks', async (c) => {
    const projectId = c.req.param('id');
    const body = await c.req.json();

    if (!body.title) return c.json({ error: 'title is required' }, 400);

    // Get next order number
    const lastTask = db.select({ maxOrder: sql<number>`max("order")` })
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId))
      .get();

    const now = Date.now();
    const result = db.insert(projectTasks).values({
      projectId,
      title: body.title,
      description: body.description || null,
      status: body.status || 'pending',
      agentName: body.agentName || null,
      agentType: body.agentType || 'manual',
      sessionId: body.sessionId || null,
      report: body.report || null,
      order: (lastTask?.maxOrder || 0) + 1,
      createdAt: now,
      updatedAt: now,
    }).run();

    // Update project's updatedAt
    db.update(projects)
      .set({ updatedAt: now })
      .where(eq(projects.id, projectId))
      .run();

    return c.json({ id: result.lastInsertRowid, ok: true }, 201);
  });

  // ── Update a task (agent check-in / report) ────────────────────────
  app.patch('/api/projects/:projectId/tasks/:taskId', async (c) => {
    const { projectId, taskId } = c.req.param();
    const body = await c.req.json();

    const now = Date.now();
    const updates: Record<string, unknown> = { updatedAt: now };

    if (body.status) {
      updates.status = body.status;
      if (body.status === 'completed') updates.completedAt = now;
    }
    if (body.report) updates.report = body.report;
    if (body.agentName) updates.agentName = body.agentName;
    if (body.title) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;

    // Get original task before update (for auto-QA)
    const originalTask = db.select().from(projectTasks)
      .where(eq(projectTasks.id, Number(taskId)))
      .get();

    db.update(projectTasks)
      .set(updates)
      .where(eq(projectTasks.id, Number(taskId)))
      .run();

    // Update project's updatedAt
    db.update(projects)
      .set({ updatedAt: now })
      .where(eq(projects.id, projectId))
      .run();

    // Auto-create QA task when a coding task completes
    let qaTaskCreated: { id: number | bigint; agent: string } | null = null;
    if (body.status === 'completed' && originalTask && !originalTask.title.startsWith('[QA]')) {
      const coder = body.agentName || originalTask.agentName || '';
      const qaAgent = pickQaAgent(coder);

      if (qaAgent) {
        const lastOrder = db.select({ maxOrder: sql<number>`max("order")` })
          .from(projectTasks)
          .where(eq(projectTasks.projectId, projectId))
          .get();

        const qaResult = db.insert(projectTasks).values({
          projectId,
          title: `[QA] Review: ${originalTask.title}`,
          description: `QA review for completed task by ${coder || 'unknown'}. Verify the work is correct and meets requirements.`,
          status: 'pending',
          agentName: qaAgent.name,
          agentType: 'assigned',
          order: (lastOrder?.maxOrder || 0) + 1,
          createdAt: now,
          updatedAt: now,
        }).run();

        qaTaskCreated = { id: qaResult.lastInsertRowid, agent: qaAgent.name };

        // Notify QA agent via maw hey
        try {
          const msg = `QA task assigned: Review "${originalTask.title}" (${projectId}). Coder: ${coder || 'unknown'}. Check /api/projects/${projectId} for details.`;
          Bun.spawn(['maw', 'hey', qaAgent.name, msg]);
        } catch (e) {
          console.warn('Failed to notify QA agent:', e);
        }
      }
    }

    // Check if all tasks completed → auto-complete project
    const pending = db.select({ count: sql<number>`count(*)` })
      .from(projectTasks)
      .where(sql`${projectTasks.projectId} = ${projectId} AND ${projectTasks.status} != 'completed'`)
      .get();

    const total = db.select({ count: sql<number>`count(*)` })
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId))
      .get();

    if (total && total.count > 0 && pending?.count === 0) {
      db.update(projects)
        .set({ status: 'completed', completedAt: now, updatedAt: now })
        .where(eq(projects.id, projectId))
        .run();

      return c.json({ ok: true, projectCompleted: true, qaTaskCreated });
    }

    return c.json({ ok: true, projectCompleted: false, qaTaskCreated });
  });

  // ── Delete a task ──────────────────────────────────────────────────
  app.delete('/api/projects/:projectId/tasks/:taskId', (c) => {
    const { taskId } = c.req.param();

    db.delete(projectTasks)
      .where(eq(projectTasks.id, Number(taskId)))
      .run();

    return c.json({ ok: true });
  });

  // ── Project stats summary ──────────────────────────────────────────
  app.get('/api/projects/stats/summary', (c) => {
    const active = db.select({ count: sql<number>`count(*)` })
      .from(projects).where(eq(projects.status, 'active')).get();
    const completed = db.select({ count: sql<number>`count(*)` })
      .from(projects).where(eq(projects.status, 'completed')).get();
    const total = db.select({ count: sql<number>`count(*)` })
      .from(projects).get();

    return c.json({
      active: active?.count || 0,
      completed: completed?.count || 0,
      total: total?.count || 0,
    });
  });
}
