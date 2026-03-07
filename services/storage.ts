
import { get, set, del } from 'idb-keyval';
import type { Project, ProjectSummary } from '../types.ts';

const INDEX_KEY = 'td_projects_index';
const PROJ_PREFIX = 'td_project_';

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const getProjects = async (): Promise<ProjectSummary[]> => {
  try {
    const raw = await get(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { 
    console.error("Failed to load project index", e);
    return []; 
  }
};

export const createProject = async (): Promise<string> => {
  const id = generateId();
  const now = Date.now();
  const newProject: Project = {
    id,
    name: 'Untitled Analysis',
    updatedAt: now,
    videoUrl: '',
    status: 'idle',
    actionCount: 0,
    durationInput: '',
    chunkSize: 60,
    overlap: 30,
    customContext: '',
    chunks: [],
    actions: [],
    narrativeSteps: [],
    procState: {
      status: 'idle',
      currentChunkIndex: 0,
      totalActions: 0,
      totalTokens: 0,
      startTime: null,
      lastInteractionId: null,
      chatHistory: [],
      logs: []
    },
    latestUIState: null
  };
  
  // Save Data
  try {
    await set(PROJ_PREFIX + id, JSON.stringify(newProject));
    
    // Update Index
    const index = await getProjects();
    index.unshift({
      id,
      name: newProject.name,
      updatedAt: now,
      videoUrl: '',
      status: 'idle',
      actionCount: 0
    });
    await set(INDEX_KEY, JSON.stringify(index));
  } catch (e) {
    console.error("Storage limit reached or error", e);
    alert("Failed to create project. Storage might be full.");
    return '';
  }
  
  return id;
};

export const getProject = async (id: string): Promise<Project | null> => {
  try {
    const data = await get(PROJ_PREFIX + id);
    const parsed = data ? JSON.parse(data) : null;
    // Backwards compatibility for older saves without narrativeSteps
    if (parsed && !parsed.narrativeSteps) {
        parsed.narrativeSteps = [];
    }
    // Backwards compatibility for logs
    if (parsed && !parsed.procState.logs) {
        parsed.procState.logs = [];
    }
    return parsed;
  } catch { return null; }
};

export const saveProject = async (data: Project) => {
  const now = Date.now();
  const updated = { ...data, updatedAt: now };
  
  try {
    await set(PROJ_PREFIX + data.id, JSON.stringify(updated));
    
    // Update index
    const index = await getProjects();
    const idx = index.findIndex(p => p.id === data.id);
    const summary: ProjectSummary = {
      id: data.id,
      name: data.name || 'Untitled Analysis',
      updatedAt: now,
      videoUrl: data.videoUrl,
      status: data.procState.status,
      actionCount: data.actions.length
    };
    
    if (idx >= 0) {
      index[idx] = summary;
    } else {
      index.unshift(summary);
    }
    await set(INDEX_KEY, JSON.stringify(index));
  } catch (e) {
    console.error("Failed to save project", e);
  }
};

export const deleteProject = async (id: string) => {
  await del(PROJ_PREFIX + id);
  const index = (await getProjects()).filter(p => p.id !== id);
  await set(INDEX_KEY, JSON.stringify(index));
};
