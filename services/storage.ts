
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, query, where, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Project, ProjectSummary, Vocabulary } from '../types.ts';

export const generateId = () => Math.random().toString(36).substr(2, 9);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const getVocabularies = async (): Promise<Vocabulary[]> => {
  if (!auth.currentUser) return [];
  try {
    const q = query(
      collection(db, 'vocabularies'),
      where('userId', '==', auth.currentUser.uid)
    );
    const snapshot = await getDocs(q);
    const vocabularies: Vocabulary[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      vocabularies.push({
        id: data.id,
        userId: data.userId,
        name: data.name,
        softwareName: data.softwareName,
        content: data.content,
        updatedAt: data.updatedAt
      });
    });
    return vocabularies.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'vocabularies');
    return [];
  }
};

export const saveVocabulary = async (vocab: Omit<Vocabulary, 'id' | 'userId' | 'updatedAt'> & { id?: string }): Promise<string> => {
  if (!auth.currentUser) throw new Error("Must be logged in to save a vocabulary");
  
  const id = vocab.id || generateId();
  const now = Date.now();
  
  const firestoreData: Vocabulary = {
    id,
    userId: auth.currentUser.uid,
    name: vocab.name,
    softwareName: vocab.softwareName,
    content: vocab.content,
    updatedAt: now
  };
  
  try {
    await setDoc(doc(db, 'vocabularies', id), firestoreData);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `vocabularies/${id}`);
  }
  
  return id;
};

export const deleteVocabulary = async (id: string) => {
  if (!auth.currentUser) return;
  try {
    await deleteDoc(doc(db, 'vocabularies', id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `vocabularies/${id}`);
  }
};

export const getProjects = async (): Promise<ProjectSummary[]> => {
  if (!auth.currentUser) return [];
  try {
    const q = query(
      collection(db, 'projects'),
      where('userId', '==', auth.currentUser.uid)
      // Note: orderBy requires an index if combined with where, so we sort client-side for now
    );
    const snapshot = await getDocs(q);
    const projects: ProjectSummary[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      projects.push({
        id: data.id,
        name: data.name,
        updatedAt: data.updatedAt,
        videoUrl: data.videoUrl || '',
        status: data.status,
        actionCount: data.actionCount || 0
      });
    });
    return projects.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (e) {
    handleFirestoreError(e, OperationType.LIST, 'projects');
    return [];
  }
};

export const createProject = async (): Promise<string> => {
  if (!auth.currentUser) throw new Error("Must be logged in to create a project");
  
  const id = generateId();
  const now = Date.now();
  const newProject = {
    id,
    userId: auth.currentUser.uid,
    name: 'Untitled Analysis',
    updatedAt: now,
    videoUrl: '',
    status: 'idle',
    actionCount: 0,
    durationInput: '',
    chunkSize: 60,
    overlap: 30,
    customContext: '',
    softwareName: '',
    glossaryPath: 'glossary/elements.json',
    chunks: '[]',
    actions: '[]',
    annotations: '[]',
    narrativeSteps: '[]',
    procState: JSON.stringify({
      status: 'idle',
      currentChunkIndex: 0,
      totalActions: 0,
      totalTokens: 0,
      startTime: null,
      lastInteractionId: null,
      chatHistory: [],
      logs: []
    }),
    latestUIState: 'null'
  };
  
  try {
    await setDoc(doc(db, 'projects', id), newProject);
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, `projects/${id}`);
  }
  
  return id;
};

export const getProject = async (id: string): Promise<Project | null> => {
  if (!auth.currentUser) return null;
  
  try {
    const docSnap = await getDoc(doc(db, 'projects', id));
    if (!docSnap.exists()) return null;
    
    const data = docSnap.data();
    
    // Parse JSON fields
    const parsed: Project = {
      id: data.id,
      name: data.name,
      updatedAt: data.updatedAt,
      videoUrl: data.videoUrl || '',
      status: data.status,
      actionCount: data.actionCount || 0,
      durationInput: data.durationInput || '',
      chunkSize: data.chunkSize || 60,
      overlap: data.overlap || 30,
      customContext: data.customContext || '',
      softwareName: data.softwareName || '',
      glossaryPath: data.glossaryPath || 'glossary/elements.json',
      chunks: data.chunks ? JSON.parse(data.chunks) : [],
      actions: data.actions ? JSON.parse(data.actions) : [],
      annotations: data.annotations ? JSON.parse(data.annotations) : [],
      narrativeSteps: data.narrativeSteps ? JSON.parse(data.narrativeSteps) : [],
      procState: data.procState ? JSON.parse(data.procState) : { status: 'idle', logs: [] },
      latestUIState: data.latestUIState ? JSON.parse(data.latestUIState) : null
    };
    
    // Backwards compatibility
    if (!parsed.narrativeSteps) parsed.narrativeSteps = [];
    if (!parsed.procState.logs) parsed.procState.logs = [];
    
    return parsed;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, `projects/${id}`);
    return null;
  }
};

export const saveProject = async (data: Project) => {
  if (!auth.currentUser) return;
  
  const now = Date.now();
  
  const firestoreData = {
    id: data.id,
    userId: auth.currentUser.uid,
    name: data.name || 'Untitled Analysis',
    updatedAt: now,
    videoUrl: data.videoUrl || '',
    status: data.procState?.status || data.status || 'idle',
    actionCount: data.actions?.length || 0,
    durationInput: data.durationInput || '',
    chunkSize: data.chunkSize || 60,
    overlap: data.overlap || 30,
    customContext: data.customContext || '',
    softwareName: data.softwareName || '',
    glossaryPath: data.glossaryPath || 'glossary/elements.json',
    chunks: JSON.stringify(data.chunks || []),
    actions: JSON.stringify(data.actions || []),
    annotations: JSON.stringify(data.annotations || []),
    narrativeSteps: JSON.stringify(data.narrativeSteps || []),
    procState: JSON.stringify(data.procState || { status: 'idle', logs: [] }),
    latestUIState: JSON.stringify(data.latestUIState || null)
  };
  
  try {
    await setDoc(doc(db, 'projects', data.id), firestoreData);
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `projects/${data.id}`);
  }
};

export const deleteProject = async (id: string) => {
  if (!auth.currentUser) return;
  try {
    await deleteDoc(doc(db, 'projects', id));
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, `projects/${id}`);
  }
};
