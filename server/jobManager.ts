import { v4 as uuidv4 } from 'uuid';
import { analyzeChunkPhaseA, accumulateChunkPhaseB, analyzeNarrationSegment } from '../services/geminiService.ts';
import type { ActionItem, NarrativeStep, ProcessingState, UIState, LogLevel } from '../types.ts';
import { computeChunkWindows, parseMMSS } from '../utils/timeUtils.ts';
import type { Chunk } from '../types.ts';

export interface JobState {
  id: string;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  progress: number;
  logs: { timestamp: number; level: LogLevel; message: string; data?: any }[];
  actions: ActionItem[];
  narrativeSteps: NarrativeStep[];
  uiState: UIState | null;
  error?: string;
  videoUrl: string;
  duration: number;
  chunks: Chunk[];
  currentChunkIndex: number;
}

const jobs = new Map<string, JobState>();
const cancelTokens = new Set<string>();

export async function fetchYouTubeDuration(url: string): Promise<number> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = await response.text();
    
    // Pattern 1: "lengthSeconds":"1234"
    const lengthMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/) || html.match(/"lengthSeconds"\s*:\s*(\d+)/);
    if (lengthMatch && lengthMatch[1]) {
      return parseInt(lengthMatch[1], 10);
    }

    // Pattern 2: approxDurationMs (often in ytInitialPlayerResponse)
    const approxMatch = html.match(/"approxDurationMs"\s*:\s*"(\d+)"/) || html.match(/"approxDurationMs"\s*:\s*(\d+)/);
    if (approxMatch && approxMatch[1]) {
      return Math.floor(parseInt(approxMatch[1], 10) / 1000);
    }

    // Pattern 3: <meta itemprop="duration" content="PT1M34S">
    const metaMatch = html.match(/<meta\s+itemprop="duration"\s+content="PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"/);
    if (metaMatch) {
      const hours = parseInt(metaMatch[1] || '0', 10);
      const minutes = parseInt(metaMatch[2] || '0', 10);
      const seconds = parseInt(metaMatch[3] || '0', 10);
      return (hours * 3600) + (minutes * 60) + seconds;
    }

    throw new Error("Could not find video duration in YouTube HTML. The video might be private, age-restricted, or the page structure has changed.");
  } catch (err) {
    console.error("Error fetching YouTube duration:", err);
    throw new Error(`Failed to fetch YouTube video duration automatically: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function processVideoJob(params: {
  videoUrl: string;
  durationInput?: string;
  chunkSize: number;
  overlap: number;
  customContext: string;
  apiKey: string;
}): Promise<string> {
  const jobId = uuidv4();
  
  // Start the job asynchronously
  runJob(jobId, params).catch(err => {
    console.error(`Job ${jobId} failed:`, err);
    const state = jobs.get(jobId);
    if (state) {
      state.status = 'error';
      state.error = err.message || 'Unknown error';
    }
  });

  return jobId;
}

export function getJobState(jobId: string): JobState | undefined {
  return jobs.get(jobId);
}

export function cancelJob(jobId: string): boolean {
  if (jobs.has(jobId)) {
    cancelTokens.add(jobId);
    return true;
  }
  return false;
}

async function runJob(jobId: string, params: {
  videoUrl: string;
  durationInput?: string;
  chunkSize: number;
  overlap: number;
  customContext: string;
  apiKey: string;
}) {
  const { videoUrl, durationInput, chunkSize, overlap, customContext, apiKey } = params;
  
  const addLog = (level: LogLevel, message: string, data?: any) => {
    const state = jobs.get(jobId);
    if (state) {
      state.logs.push({ timestamp: Date.now(), level, message, data });
    }
  };

  jobs.set(jobId, {
    id: jobId,
    status: 'running',
    progress: 0,
    logs: [],
    actions: [],
    narrativeSteps: [],
    uiState: null,
    videoUrl,
    duration: 0,
    chunks: [],
    currentChunkIndex: 0
  });

  const state = jobs.get(jobId)!;

  try {
    addLog('info', 'Fetching video metadata...', { url: videoUrl });
    
    let duration = 0;
    if (durationInput) {
      duration = parseMMSS(durationInput);
      if (duration <= 0) {
        throw new Error("Invalid duration format. Please use MM:SS or HH:MM:SS.");
      }
      addLog('success', `Using provided duration: ${duration}s`);
    } else if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
      try {
        duration = await fetchYouTubeDuration(videoUrl);
        addLog('success', `Found YouTube duration: ${duration}s`);
      } catch (err: any) {
        throw new Error(`Failed to fetch YouTube duration automatically. Please provide the duration manually in the settings. Details: ${err.message}`);
      }
    } else {
      throw new Error("Duration is required for non-YouTube videos, or if YouTube duration fetching fails. Please provide a duration.");
    }

    state.duration = duration;
    state.chunks = computeChunkWindows(duration, chunkSize, overlap);
    addLog('info', `Calculated ${state.chunks.length} chunks for processing`);

    let chatHistory: any[] = [];
    let cumulativeActions: ActionItem[] = [];
    let cumulativeNarrative: NarrativeStep[] = [];
    let latestUIState: UIState | null = null;

    for (let i = 0; i < state.chunks.length; i++) {
      if (cancelTokens.has(jobId)) {
        state.status = 'cancelled';
        addLog('warn', 'Job cancelled by user');
        return;
      }

      state.currentChunkIndex = i;
      const chunk = state.chunks[i];
      const progressBase = (i / state.chunks.length) * 100;
      state.progress = progressBase;

      addLog('info', `--- Starting Chunk ${i + 1}/${state.chunks.length} ---`, { chunk });

      // Phase A: Raw Extraction
      addLog('info', `Phase A: Extracting raw actions...`);
      const rawActions = await analyzeChunkPhaseA(
        videoUrl,
        chunk.clipStart,
        chunk.clipEnd,
        chunk.primaryStart,
        chunk.primaryEnd,
        overlap,
        customContext,
        apiKey,
        addLog
      );
      
      state.progress = progressBase + (100 / state.chunks.length) * 0.3;

      // Phase B: Validation & State
      addLog('info', `Phase B: Validating and merging state...`);
      const primaryWindowStr = `${chunk.primaryStart}s-${chunk.primaryEnd}s`;
      const phaseBResult = await accumulateChunkPhaseB(
        videoUrl,
        `${duration}s`,
        rawActions,
        i + 1,
        primaryWindowStr,
        chatHistory,
        customContext,
        apiKey,
        addLog
      );

      chatHistory = phaseBResult.newHistory;
      latestUIState = phaseBResult.result.current_ui_state;
      state.uiState = latestUIState;
      
      // Append new validated actions
      cumulativeActions = [...cumulativeActions, ...phaseBResult.result.validated_segment_events];
      state.actions = cumulativeActions;
      
      state.progress = progressBase + (100 / state.chunks.length) * 0.6;

      // Phase C: Narrative Synthesis
      addLog('info', `Phase C: Synthesizing narrative steps...`);
      const newNarrativeSteps = await analyzeNarrationSegment(
        videoUrl,
        chunk.clipStart,
        chunk.clipEnd,
        phaseBResult.result.validated_segment_events,
        customContext,
        apiKey,
        addLog
      );

      cumulativeNarrative = [...cumulativeNarrative, ...newNarrativeSteps];
      state.narrativeSteps = cumulativeNarrative;

      state.progress = progressBase + (100 / state.chunks.length);
      addLog('success', `Chunk ${i + 1} completed successfully.`);
    }

    state.progress = 100;
    state.status = 'completed';
    addLog('success', 'Workflow analysis completed successfully!');

  } catch (error: any) {
    console.error(`Job ${jobId} failed:`, error);
    state.status = 'error';
    state.error = error.message || 'Unknown error occurred';
    addLog('error', `Fatal error: ${state.error}`);
  } finally {
    cancelTokens.delete(jobId);
  }
}
