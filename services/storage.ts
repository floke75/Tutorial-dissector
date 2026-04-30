
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
    glossaryPath: 'cuez_rundown_vocabulary_v2.4.json',
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
    
    // Function to retrieve chunked large strings
    const getLargeString = async (key: string, fallback: string): Promise<string> => {
      if (data[key] && data[key] !== 'CHUNKED') {
        return data[key]; // Backward compatibility
      }
      try {
        const metaSnap = await getDoc(doc(db, 'projects', id, 'blobs', key));
        if (!metaSnap.exists()) return fallback;
        const numChunks = metaSnap.data().chunks;
        let result = "";
        for (let i = 0; i < numChunks; i++) {
          const chunkSnap = await getDoc(doc(db, 'projects', id, 'blobs', `${key}_${i}`));
          if (chunkSnap.exists()) {
            result += chunkSnap.data().data;
          }
        }
        return result || fallback;
      } catch (e) {
        console.warn(`Failed to load blob ${key}`, e);
        return fallback;
      }
    };
    
    const chunksStr = await getLargeString('chunks', '[]');
    const actionsStr = await getLargeString('actions', '[]');
    const annotationsStr = await getLargeString('annotations', '[]');
    const narrativeStepsStr = await getLargeString('narrativeSteps', '[]');
    const procStateStr = await getLargeString('procState', JSON.stringify({ status: 'idle', logs: [] }));
    const latestUIStateStr = await getLargeString('latestUIState', 'null');
    
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
      glossaryPath: data.glossaryPath || 'cuez_rundown_vocabulary_v2.4.json',
      chunks: chunksStr ? JSON.parse(chunksStr) : [],
      actions: actionsStr ? JSON.parse(actionsStr) : [],
      annotations: annotationsStr ? JSON.parse(annotationsStr) : [],
      narrativeSteps: narrativeStepsStr ? JSON.parse(narrativeStepsStr) : [],
      procState: procStateStr ? JSON.parse(procStateStr) : { status: 'idle', logs: [] },
      latestUIState: latestUIStateStr ? JSON.parse(latestUIStateStr) : null
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
  
  const saveLargeString = async (key: string, hugeString: string) => {
     const chunkSize = 800000; // ~800KB
     const numChunks = Math.ceil(hugeString.length / chunkSize);
     
     // write the metadata info
     await setDoc(doc(db, 'projects', data.id, 'blobs', key), { chunks: numChunks, updatedAt: now });

     // write chunks
     for (let i = 0; i < numChunks; i++) {
       const chunkStr = hugeString.slice(i * chunkSize, (i + 1) * chunkSize);
       await setDoc(doc(db, 'projects', data.id, 'blobs', `${key}_${i}`), { data: chunkStr });
     }
  };
  
  try {
    const chunksStr = JSON.stringify(data.chunks || []);
    const actionsStr = JSON.stringify(data.actions || []);
    const annotationsStr = JSON.stringify(data.annotations || []);
    const narrativeStepsStr = JSON.stringify(data.narrativeSteps || []);
    const procStateStr = JSON.stringify(data.procState || { status: 'idle', logs: [] });
    const latestUIStateStr = JSON.stringify(data.latestUIState || null);
    
    const firestoreData: any = {
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
      glossaryPath: data.glossaryPath || 'cuez_rundown_vocabulary_v2.4.json'
    };

    const totalSize = chunksStr.length + actionsStr.length + annotationsStr.length + 
                      narrativeStepsStr.length + procStateStr.length + latestUIStateStr.length;

    // If total size easily fits in 1MB Firestore limit, do 1 write instead of 13!
    if (totalSize < 800000) {
      firestoreData.chunks = chunksStr;
      firestoreData.actions = actionsStr;
      firestoreData.annotations = annotationsStr;
      firestoreData.narrativeSteps = narrativeStepsStr;
      firestoreData.procState = procStateStr;
      firestoreData.latestUIState = latestUIStateStr;
    } else {
      firestoreData.chunks = 'CHUNKED';
      firestoreData.actions = 'CHUNKED';
      firestoreData.annotations = 'CHUNKED';
      firestoreData.narrativeSteps = 'CHUNKED';
      firestoreData.procState = 'CHUNKED';
      firestoreData.latestUIState = 'CHUNKED';
      
      await Promise.all([
        saveLargeString('chunks', chunksStr),
        saveLargeString('actions', actionsStr),
        saveLargeString('annotations', annotationsStr),
        saveLargeString('narrativeSteps', narrativeStepsStr),
        saveLargeString('procState', procStateStr),
        saveLargeString('latestUIState', latestUIStateStr)
      ]);
    }
    
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
