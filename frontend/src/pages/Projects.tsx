import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getProjects, getProject, createProject, updateProject,
  addProjectTask, updateProjectTask, deleteProjectTask,
  getAgentAvailability,
  type Project, type ProjectTask, type AgentAvailability,
} from '../api/oracle';
import styles from './Projects.module.css';

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

// Sound notification using Web Audio API
function playCompletionSound() {
  try {
    const ctx = new AudioContext();

    // Victory chord: C-E-G-C (major chord + octave)
    const notes = [261.63, 329.63, 392.00, 523.25];
    const startTimes = [0, 0.12, 0.24, 0.36];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + startTimes[i]);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + startTimes[i] + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTimes[i] + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startTimes[i]);
      osc.stop(ctx.currentTime + startTimes[i] + 0.9);
    });

    // Sparkle on top
    setTimeout(() => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1046.5; // High C
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    }, 500);

    // Also try speech
    if ('speechSynthesis' in window) {
      const phrases = ['Good Job!', 'Great Work!', 'Done!', 'Awesome!', 'Well Done!'];
      const phrase = phrases[Math.floor(Math.random() * phrases.length)];
      const utter = new SpeechSynthesisUtterance(phrase);
      utter.rate = 1.0;
      utter.pitch = 1.2;
      utter.volume = 0.8;
      setTimeout(() => speechSynthesis.speak(utter), 700);
    }
  } catch (e) {
    console.error('Sound failed:', e);
  }
}

export function Projects() {
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  // Modal state
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskAgent, setNewTaskAgent] = useState('');

  // Agent picker
  const [agents, setAgents] = useState<AgentAvailability[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [swapMessage, setSwapMessage] = useState('');

  // QA toast
  const [qaToast, setQaToast] = useState('');

  // Celebration
  const [celebration, setCelebration] = useState(false);
  const celebrationTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const loadProjects = useCallback(async () => {
    try {
      const statusParam = filter === 'all' ? undefined : filter;
      const data = await getProjects(statusParam);
      setProjectsList(data.projects);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filter]);

  const loadProjectDetail = useCallback(async (id: string) => {
    try {
      const data = await getProject(id);
      setSelectedProject(data.project);
      setTasks(data.tasks);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Auto-refresh every 10s to pick up agent updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (selectedProject) {
        loadProjectDetail(selectedProject.id);
      } else {
        loadProjects();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedProject, loadProjectDetail, loadProjects]);

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    const result = await createProject({ name: newProjectName, description: newProjectDesc || undefined });
    setShowCreateProject(false);
    setNewProjectName('');
    setNewProjectDesc('');
    loadProjects();
    // Auto-open the new project
    loadProjectDetail(result.id);
  }

  async function loadAgents() {
    setAgentsLoading(true);
    try {
      const data = await getAgentAvailability();
      setAgents(data.agents);
    } catch (e) { console.error(e); }
    finally { setAgentsLoading(false); }
  }

  function handleSelectAgent(agent: AgentAvailability) {
    if (agent.status === 'offline') return;

    if (agent.status === 'busy') {
      // Auto-swap: find first free agent in same group
      const sameGroupFree = agents.find(a => a.group === agent.group && a.status === 'free');
      if (sameGroupFree) {
        setNewTaskAgent(sameGroupFree.name);
        setSwapMessage(`${agent.name} is busy — assigned to ${sameGroupFree.name} instead`);
        return;
      }
      // Expand to any free agent
      const anyFree = agents.find(a => a.status === 'free');
      if (anyFree) {
        setNewTaskAgent(anyFree.name);
        setSwapMessage(`${agent.name} is busy — assigned to ${anyFree.name} (${anyFree.group}) instead`);
        return;
      }
      // All busy — assign anyway with warning
      setNewTaskAgent(agent.name);
      setSwapMessage(`All agents busy — assigning to ${agent.name} anyway`);
      return;
    }

    // Free agent — direct assign
    setNewTaskAgent(agent.name);
    setSwapMessage('');
  }

  async function handleAddTask() {
    if (!selectedProject || !newTaskTitle.trim()) return;
    await addProjectTask(selectedProject.id, {
      title: newTaskTitle,
      description: newTaskDesc || undefined,
      agentName: newTaskAgent || undefined,
      agentType: newTaskAgent ? 'assigned' : 'manual',
    });
    setShowAddTask(false);
    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskAgent('');
    setSwapMessage('');
    loadProjectDetail(selectedProject.id);
  }

  async function handleToggleTask(task: ProjectTask) {
    if (!selectedProject) return;
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    const result = await updateProjectTask(selectedProject.id, task.id, { status: newStatus });
    loadProjectDetail(selectedProject.id);

    if (result.qaTaskCreated) {
      setQaToast(`QA task auto-assigned to ${result.qaTaskCreated.agent}`);
      setTimeout(() => setQaToast(''), 4000);
    }

    if (result.projectCompleted) {
      triggerCelebration();
    }
  }

  async function handleCompleteProject() {
    if (!selectedProject) return;
    await updateProject(selectedProject.id, { status: 'completed' } as Partial<Project>);
    triggerCelebration();
    loadProjectDetail(selectedProject.id);
    loadProjects();
  }

  async function handleDeleteTask(taskId: number) {
    if (!selectedProject) return;
    await deleteProjectTask(selectedProject.id, taskId);
    loadProjectDetail(selectedProject.id);
  }

  function triggerCelebration() {
    setCelebration(true);
    playCompletionSound();
    if (celebrationTimeout.current) clearTimeout(celebrationTimeout.current);
    celebrationTimeout.current = setTimeout(() => {
      setCelebration(false);
      loadProjects();
    }, 3500);
  }

  function getTaskProgress(tasksList: ProjectTask[]): number {
    if (!tasksList.length) return 0;
    const done = tasksList.filter(t => t.status === 'completed').length;
    return Math.round((done / tasksList.length) * 100);
  }

  // ── Detail View ──────────────────────────────────────────────
  if (selectedProject) {
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const progress = getTaskProgress(tasks);
    const allDone = tasks.length > 0 && completedCount === tasks.length;

    return (
      <div className={styles.container}>
        <button className={styles.backBtn} onClick={() => { setSelectedProject(null); loadProjects(); }}>
          ← Back to Projects
        </button>

        <div className={styles.detailHeader}>
          <div className={styles.headerRow}>
            <div>
              <div className={styles.detailTitle}>{selectedProject.name}</div>
              {selectedProject.description && (
                <div className={styles.projectDesc}>{selectedProject.description}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className={`${styles.statusBadge} ${styles[selectedProject.status]}`}>
                {selectedProject.status}
              </span>
              {selectedProject.status === 'active' && allDone && (
                <button className={styles.completeBtn} onClick={handleCompleteProject}>
                  Mark Complete
                </button>
              )}
            </div>
          </div>
          <div className={styles.detailMeta}>
            <span>{selectedProject.id}</span>
            <span>Assigned by: {selectedProject.assignedBy}</span>
            <span>Created: {formatTime(selectedProject.createdAt)}</span>
            <span>{completedCount}/{tasks.length} tasks done</span>
          </div>
          {tasks.length > 0 && (
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        {qaToast && <div className={styles.qaToast}>{qaToast}</div>}

        <div className={styles.tasksSection}>
          <div className={styles.tasksSectionTitle}>
            Tasks
            <button className={styles.addTaskBtn} onClick={() => { setShowAddTask(true); loadAgents(); }}>
              + Add Task
            </button>
          </div>

          {tasks.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📋</div>
              <div className={styles.emptyText}>No tasks yet</div>
              <div className={styles.emptySubtext}>Add tasks or let agents report automatically</div>
            </div>
          ) : (
            <div className={styles.taskList}>
              {tasks.map(task => (
                <div key={task.id} className={styles.taskCard}>
                  <button
                    className={`${styles.taskCheckbox} ${task.status === 'completed' ? styles.done : task.status === 'in_progress' ? styles.inProgress : ''}`}
                    onClick={() => handleToggleTask(task)}
                    title={task.status === 'completed' ? 'Mark pending' : 'Mark complete'}
                  >
                    {task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '⟳' : ''}
                  </button>
                  <div className={styles.taskBody}>
                    <div className={`${styles.taskTitle} ${task.status === 'completed' ? styles.done : ''}`}>
                      {task.title}
                    </div>
                    {task.agentName && (
                      <div className={styles.taskAgent}>
                        🤖 {task.agentName}
                        {task.agentType === 'spawn' && ' (spawned)'}
                        {task.agentType === 'assigned' && ' (assigned)'}
                      </div>
                    )}
                    {task.report && (
                      <div className={styles.taskReport}>{task.report}</div>
                    )}
                    <div className={styles.taskTime}>
                      {task.completedAt ? `Completed ${formatTime(task.completedAt)}` : `Updated ${formatTime(task.updatedAt)}`}
                    </div>
                  </div>
                  <div className={styles.taskActions}>
                    <button
                      className={`${styles.taskActionBtn} ${styles.delete}`}
                      onClick={() => handleDeleteTask(task.id)}
                      title="Delete task"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Task Modal */}
        {showAddTask && (
          <div className={styles.modalOverlay} onClick={() => { setShowAddTask(false); setSwapMessage(''); }}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalTitle}>Add Task</div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Title</label>
                <input
                  className={styles.formInput}
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  placeholder="Task description..."
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Description (optional)</label>
                <textarea
                  className={styles.formTextarea}
                  value={newTaskDesc}
                  onChange={e => setNewTaskDesc(e.target.value)}
                  placeholder="Details..."
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Assign Agent (optional)</label>
                {newTaskAgent && (
                  <div className={styles.selectedAgentChip}>
                    <span className={`${styles.statusDot} ${styles[agents.find(a => a.name === newTaskAgent)?.status || 'free']}`} />
                    {newTaskAgent}
                    <button className={styles.selectedAgentClear} onClick={() => { setNewTaskAgent(''); setSwapMessage(''); }}>x</button>
                  </div>
                )}
                {swapMessage && <div className={styles.swapToast}>{swapMessage}</div>}
                <div className={styles.agentPicker}>
                  {agentsLoading ? (
                    <div className={styles.agentPickerLoading}>Loading agents...</div>
                  ) : agents.length === 0 ? (
                    <div className={styles.agentPickerLoading}>No agents found</div>
                  ) : (
                    (() => {
                      const groups = [...new Set(agents.map(a => a.group))];
                      return groups.map(group => (
                        <div key={group}>
                          <div className={styles.agentGroupLabel}>{group}</div>
                          {agents.filter(a => a.group === group).map(agent => (
                            <button
                              key={agent.name}
                              className={`${styles.agentOption} ${agent.name === newTaskAgent ? styles.selected : ''} ${agent.status === 'offline' ? styles.offline : ''}`}
                              onClick={() => handleSelectAgent(agent)}
                              disabled={agent.status === 'offline'}
                            >
                              <span className={`${styles.statusDot} ${styles[agent.status]}`} />
                              <span className={styles.agentOptionName}>{agent.name}</span>
                              <span className={styles.agentOptionStatus}>{agent.status}</span>
                            </button>
                          ))}
                        </div>
                      ));
                    })()
                  )}
                </div>
              </div>
              <div className={styles.modalActions}>
                <button className={styles.cancelBtn} onClick={() => { setShowAddTask(false); setSwapMessage(''); }}>Cancel</button>
                <button className={styles.submitBtn} onClick={handleAddTask} disabled={!newTaskTitle.trim()}>Add Task</button>
              </div>
            </div>
          </div>
        )}

        {celebration && (
          <div className={styles.celebration} onClick={() => setCelebration(false)}>
            <div className={styles.celebrationContent}>
              <div className={styles.celebrationEmoji}>🎉</div>
              <div className={styles.celebrationText}>Good Job!!</div>
              <div className={styles.celebrationSub}>Project completed successfully</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List View ──────────────────────────────────────────────────
  const stats = {
    total: projectsList.length,
    active: projectsList.filter(p => p.status === 'active').length,
    completed: projectsList.filter(p => p.status === 'completed').length,
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Projects</h1>
        <button className={styles.createBtn} onClick={() => setShowCreateProject(true)}>
          + New Project
        </button>
      </div>

      <div className={styles.statsBar}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.total}</div>
          <div className={styles.statLabel}>Total</div>
        </div>
        <div className={`${styles.statCard} ${styles.active}`}>
          <div className={styles.statValue}>{stats.active}</div>
          <div className={styles.statLabel}>Active</div>
        </div>
        <div className={`${styles.statCard} ${styles.done}`}>
          <div className={styles.statValue}>{stats.completed}</div>
          <div className={styles.statLabel}>Completed</div>
        </div>
      </div>

      <div className={styles.filterTabs}>
        {['all', 'active', 'completed', 'paused'].map(f => (
          <button
            key={f}
            className={`${styles.filterBtn} ${filter === f ? styles.active : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loading}>Loading projects...</div>
      ) : projectsList.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📂</div>
          <div className={styles.emptyText}>No projects yet</div>
          <div className={styles.emptySubtext}>Create a project to start tracking work</div>
        </div>
      ) : (
        <div className={styles.projectList}>
          {projectsList.map(project => (
            <div
              key={project.id}
              className={`${styles.projectCard} ${styles[project.status]}`}
              onClick={() => loadProjectDetail(project.id)}
            >
              <div className={styles.projectCardTop}>
                <span className={styles.projectId}>{project.id}</span>
                <span className={`${styles.statusBadge} ${styles[project.status]}`}>
                  {project.status}
                </span>
              </div>
              <div className={styles.projectName}>{project.name}</div>
              {project.description && (
                <div className={styles.projectDesc}>{project.description}</div>
              )}
              <div className={styles.projectMeta}>
                <span>By: {project.assignedBy}</span>
                <span>{formatTime(project.updatedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateProject && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateProject(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalTitle}>New Project</div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Project Name</label>
              <input
                className={styles.formInput}
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="e.g. Website Redesign..."
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description (optional)</label>
              <textarea
                className={styles.formTextarea}
                value={newProjectDesc}
                onChange={e => setNewProjectDesc(e.target.value)}
                placeholder="What needs to be done..."
              />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowCreateProject(false)}>Cancel</button>
              <button className={styles.submitBtn} onClick={handleCreateProject} disabled={!newProjectName.trim()}>Create</button>
            </div>
          </div>
        </div>
      )}

      {celebration && (
        <div className={styles.celebration} onClick={() => setCelebration(false)}>
          <div className={styles.celebrationContent}>
            <div className={styles.celebrationEmoji}>🎉</div>
            <div className={styles.celebrationText}>Good Job!!</div>
            <div className={styles.celebrationSub}>Project completed successfully</div>
          </div>
        </div>
      )}
    </div>
  );
}
