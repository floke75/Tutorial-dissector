
import { Project, ProjectSummary } from '../types';

const INDEX_KEY = 'td_projects_index';
const PROJ_PREFIX = 'td_project_';

export const generateId = () => Math.random().toString(36).substr(2, 9);

export const getProjects = (): ProjectSummary[] => {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { 
    console.error("Failed to load project index", e);
    return []; 
  }
};

export const createProject = (): string => {
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
    chunkSize: 300,
    overlap: 60,
    chunks: [],
    actions: [],
    procState: {
      status: 'idle',
      currentChunkIndex: 0,
      narrationStartTime: 0,
      totalActions: 0,
      totalTokens: 0,
      startTime: null,
      lastInteractionId: null
    },
    latestUIState: null
  };
  
  // Save Data
  try {
    localStorage.setItem(PROJ_PREFIX + id, JSON.stringify(newProject));
    
    // Update Index
    const index = getProjects();
    index.unshift({
      id,
      name: newProject.name,
      updatedAt: now,
      videoUrl: '',
      status: 'idle',
      actionCount: 0
    });
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (e) {
    console.error("Storage limit reached or error", e);
    alert("Failed to create project. Storage might be full.");
    return '';
  }
  
  return id;
};

export const getProject = (id: string): Project | null => {
  try {
    const data = localStorage.getItem(PROJ_PREFIX + id);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
};

export const saveProject = (data: Project) => {
  const now = Date.now();
  const updated = { ...data, updatedAt: now };
  
  try {
    localStorage.setItem(PROJ_PREFIX + data.id, JSON.stringify(updated));
    
    // Update index
    const index = getProjects();
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
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (e) {
    console.error("Failed to save project", e);
  }
};

export const deleteProject = (id: string) => {
  localStorage.removeItem(PROJ_PREFIX + id);
  const index = getProjects().filter(p => p.id !== id);
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
};
