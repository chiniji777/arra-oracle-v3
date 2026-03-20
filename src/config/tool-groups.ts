/**
 * Tool Group Configuration
 *
 * Controls which tool groups are registered at startup.
 * Config sources (in priority order):
 *   1. arra.config.json in repo root (ORACLE_REPO_ROOT or cwd)
 *   2. ~/.oracle/config.json (global)
 *   3. Defaults: all groups enabled
 */

import fs from 'fs';
import path from 'path';

export const TOOL_GROUPS = {
  search: ['oracle_search', 'oracle_read', 'oracle_list', 'oracle_concepts'],
  knowledge: ['oracle_learn', 'oracle_reflect', 'oracle_stats', 'oracle_supersede', 'oracle_verify'],
  session: ['oracle_handoff', 'oracle_inbox'],
  schedule: ['oracle_schedule_add', 'oracle_schedule_list'],
  forum: ['oracle_thread', 'oracle_threads', 'oracle_thread_read', 'oracle_thread_update'],
  trace: ['oracle_trace', 'oracle_trace_list', 'oracle_trace_get', 'oracle_trace_link', 'oracle_trace_unlink', 'oracle_trace_chain'],
} as const;

export type ToolGroupName = keyof typeof TOOL_GROUPS;

export type ToolGroupConfig = Record<ToolGroupName, boolean>;

const DEFAULT_CONFIG: ToolGroupConfig = {
  search: true,
  knowledge: true,
  session: true,
  schedule: true,
  forum: true,
  trace: true,
};

function readJsonSafe(filePath: string): Record<string, any> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export function loadToolGroupConfig(repoRoot?: string): ToolGroupConfig {
  const root = repoRoot || process.env.ORACLE_REPO_ROOT || process.cwd();
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';

  // Priority 1: repo-local arra.config.json
  const localConfig = readJsonSafe(path.join(root, 'arra.config.json'));
  if (localConfig?.tools) {
    console.error('[ToolGroups] Using arra.config.json from repo root');
    return { ...DEFAULT_CONFIG, ...localConfig.tools };
  }

  // Priority 2: global ~/.oracle/config.json
  const globalConfig = readJsonSafe(path.join(homeDir, '.oracle', 'config.json'));
  if (globalConfig?.tools) {
    console.error('[ToolGroups] Using ~/.oracle/config.json');
    return { ...DEFAULT_CONFIG, ...globalConfig.tools };
  }

  // Priority 3: all enabled
  return { ...DEFAULT_CONFIG };
}

/** Returns a Set of tool names that should be disabled based on config */
export function getDisabledTools(config: ToolGroupConfig): Set<string> {
  const disabled = new Set<string>();
  for (const [group, tools] of Object.entries(TOOL_GROUPS)) {
    if (!config[group as ToolGroupName]) {
      for (const tool of tools) {
        disabled.add(tool);
      }
    }
  }
  return disabled;
}
