import { v4 as uuidv4 } from 'uuid';
import { analyzeChunkPhaseA, accumulateChunkPhaseB, analyzeNarrationSegment, analyzeGlobalDeduplication } from '../services/geminiService.ts';
import type { ActionItem, VideoAnnotation, NarrativeStep, ProcessingState, UIState, LogLevel } from '../types.ts';
import { computeChunkWindows, parseMMSS, formatMMSS } from '../utils/timeUtils.ts';
import type { Chunk } from '../types.ts';
import { detectUnlinkedActions, detectRedundantSteps, cleanFinalOutput } from '../utils/jsonOptimize.ts';

export interface JobState {
  id: string;
  runId: string;
  status: 'idle' | 'running_visual' | 'running_narrative' | 'running_dedup' | 'completed' | 'error' | 'cancelled';
  progress: number;
  logs: { id: string; timestamp: number; level: LogLevel; message: string; data?: any }[];
  actions: ActionItem[];
  annotations: VideoAnnotation[];
  narrativeSteps: NarrativeStep[];
  uiState: UIState | null;
  error?: string;
  videoUrl: string;
  duration: number;
  chunks: Chunk[];
  currentChunkIndex: number;
  narrationChunkIndex: number;
  narrationChunkSize: number;
  narrationChunkCount: number;
  chatHistory?: any[];
  chunkSize: number;
  overlap: number;
  ttlTimerId?: ReturnType<typeof setTimeout>;
  learnedContext?: string;
  cleanedOutput?: any;
  lastUpdatedAt: number;
  stateVersion: number;
  logCapOccurred?: boolean;
}

import { detectViewportResolution } from '../utils/videoMeta.ts';

const jobs = new Map<string, JobState>();
const cancelTokens = new Set<string>();

const MAX_LOGS = 200;

function bumpVersion(state: JobState) {
  state.stateVersion++;
  state.lastUpdatedAt = Date.now();
}

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
  jobId?: string;
  videoUrl: string;
  durationInput?: string;
  chunkSize: number;
  overlap: number;
  narrationChunkSize?: number;
  customContext: string;
  apiKey: string;
}): Promise<string> {
  const jobId = params.jobId || uuidv4();
  
  const existingState = jobs.get(jobId);
  if (existingState && (existingState.status === 'running_visual' || existingState.status === 'running_narrative' || existingState.status === 'running_dedup')) {
    return jobId; // Job is already running, do nothing
  }

  const isResuming = !!(existingState &&
                     (existingState.status === 'cancelled' || existingState.status === 'error') &&
                     existingState.videoUrl === params.videoUrl &&
                     existingState.chunkSize === params.chunkSize &&
                     existingState.overlap === params.overlap &&
                     existingState.narrationChunkSize ===
                       (params.narrationChunkSize ?? Math.floor(params.chunkSize * 2.5)) &&
                     existingState.narrationChunkCount > 0 &&
                     existingState.chunks.length > 0);

  const runId = uuidv4();

  if (!isResuming) {
    cancelTokens.delete(jobId);
    jobs.set(jobId, {
      id: jobId,
      runId,
      status: 'running_visual',
      progress: 0,
      logs: [],
      actions: [],
      annotations: [],
      narrativeSteps: [],
      uiState: null,
      videoUrl: params.videoUrl,
      duration: 0,
      chunks: [],
      currentChunkIndex: 0,
      narrationChunkIndex: 0,
      narrationChunkSize: params.narrationChunkSize ?? Math.floor(params.chunkSize * 2.5),
      narrationChunkCount: 0,  // set after narration chunks are computed
      chatHistory: [],
      chunkSize: params.chunkSize,
      overlap: params.overlap,
      learnedContext: "",
      lastUpdatedAt: Date.now(),
      stateVersion: 1,
      logCapOccurred: false
    });
  } else {
    if (existingState!.ttlTimerId) {
      clearTimeout(existingState!.ttlTimerId);
      existingState!.ttlTimerId = undefined;
    }
    existingState!.status = 'running_visual';
    existingState!.runId = runId;
    cancelTokens.delete(jobId);
  }

  // Start the job asynchronously
  runJob(jobId, params, isResuming).catch(err => {
    console.error(`Job ${jobId} failed:`, err);
    const state = jobs.get(jobId);
    if (state) {
      state.status = 'error';
      state.error = err.message || 'Unknown error';

      // Mark the current chunk as errored
      const currentChunk = state.chunks[state.currentChunkIndex];
      if (currentChunk && currentChunk.status !== 'completed') {
        currentChunk.status = 'error';
        currentChunk.errorMsg = state.error;
      }
      bumpVersion(state);
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
  narrationChunkSize?: number;
  customContext: string;
  apiKey: string;
}, isResuming: boolean) {
  const { videoUrl, durationInput, chunkSize, overlap, customContext, apiKey } = params;
  
  const addLog = (level: LogLevel, message: string, data?: any) => {
    const state = jobs.get(jobId);
    if (state) {
      state.logs.push({ id: uuidv4(), timestamp: Date.now(), level, message, data });
      if (state.logs.length > MAX_LOGS) {
        state.logs = state.logs.slice(-MAX_LOGS);
        state.logCapOccurred = true;
      }
    }
  };

  const normalizeActionDefaults = (actions: ActionItem[]) => {
    for (const action of actions) {
      if (action.is_error_recovery === undefined) action.is_error_recovery = false;
      if (action.interacted_components === undefined) action.interacted_components = [];
      if (action.context_note === undefined) action.context_note = null;
      if (action.confidence === undefined) action.confidence = 'medium';
    }
  };

  const state = jobs.get(jobId)!;
  const runId = state.runId;

  if (isResuming) {
    if (state.currentChunkIndex >= state.chunks.length && state.narrationChunkIndex > 0) {
      if (state.narrationChunkIndex >= state.narrationChunkCount) {
        addLog('info', `Resuming job from Phase D (all narration complete, dedup failed)...`);
      } else {
        addLog('info', `Resuming job from Phase C narration chunk ${state.narrationChunkIndex + 1}/${state.narrationChunkCount}...`);
      }
    } else {
      addLog('info', `Resuming job from chunk ${state.currentChunkIndex + 1}...`);
    }
  }

  try {
    let duration = state.duration;
    
    if (!isResuming) {
      addLog('info', 'Fetching video metadata...', { url: videoUrl });
      
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
      } else if (videoUrl.includes('generativelanguage.googleapis.com')) {
        addLog('info', 'Fetching Gemini File metadata...');
        const fileId = videoUrl.split('/').pop();
        if (!fileId) throw new Error("Invalid Gemini File URI");
        
        const fileRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${fileId}`, {
          headers: {
            'x-goog-api-key': apiKey
          }
        });
        if (!fileRes.ok) {
          throw new Error(`Failed to fetch file metadata: ${fileRes.statusText}`);
        }
        const fileData = await fileRes.json();
        
        if (fileData.state !== 'ACTIVE') {
          throw new Error(`File is not ready. Current state: ${fileData.state}`);
        }
        
        if (!fileData.videoMetadata?.videoDuration) {
          throw new Error("File does not contain video duration metadata");
        }
        
        duration = parseInt(fileData.videoMetadata.videoDuration.replace('s', ''), 10);
        addLog('success', `Retrieved Gemini File duration: ${duration}s`);
      } else {
        throw new Error("Duration is required for raw video URLs.");
      }

      state.duration = duration;
      state.chunks = computeChunkWindows(duration, chunkSize, overlap);
      addLog('info', `Calculated ${state.chunks.length} chunks for processing`);
    }

    // Narration chunks: wider windows, non-aligned with A/B, reduced overlap
    const narrationChunkSize = params.narrationChunkSize ?? Math.floor(chunkSize * 2.5);
    const overlapRatio = overlap / chunkSize;
    const narrationOverlapRatio = overlapRatio * 0.4;
    const narrationOverlap = Math.round(narrationChunkSize * narrationOverlapRatio);
    const narrationChunks = computeChunkWindows(duration, narrationChunkSize, narrationOverlap);
    
    if (isResuming && state.narrationChunkCount !== narrationChunks.length) {
      throw new Error(`Narration chunk layout drift detected on resume. Expected ${state.narrationChunkCount} chunks, but computed ${narrationChunks.length}. Please start a new job.`);
    }
    
    state.narrationChunkCount = narrationChunks.length;
    addLog('info', `Narration plan: ${narrationChunks.length} chunks (${narrationChunkSize}s window, ${narrationOverlap}s overlap)`);

    let chatHistory: any[] = state.chatHistory || [];
    let cumulativeActions: ActionItem[] = state.actions || [];
    let cumulativeAnnotations: VideoAnnotation[] = state.annotations || [];
    let cumulativeNarrative: NarrativeStep[] = state.narrativeSteps || [];
    let latestUIState: UIState | null = state.uiState || null;

    const startIndex = isResuming ? state.currentChunkIndex : 0;

    for (let i = startIndex; i < state.chunks.length; i++) {
      if (cancelTokens.has(jobId)) {
        state.status = 'cancelled';
        bumpVersion(state);
        addLog('warn', 'Job cancelled by user');
        return;
      }

      state.status = 'running_visual';
      state.currentChunkIndex = i;
      const chunk = state.chunks[i];
      const progressBase = (i / state.chunks.length) * 50;
      state.progress = progressBase;

      const dynamicContext = customContext + (state.learnedContext ? "\n\nLearned Domain Knowledge:\n" + state.learnedContext : "");

      chunk.status = 'analyzing_phase_a';
      bumpVersion(state);
      addLog('info', `--- Starting Chunk ${i + 1}/${state.chunks.length} ---`, { chunk });

      // Phase A: Raw Extraction
      addLog('info', `Phase A: Extracting raw actions and annotations...`);
      const { actions: rawActions, annotations: rawAnnotations } = await analyzeChunkPhaseA(
        videoUrl,
        chunk.clipStart,
        chunk.clipEnd,
        chunk.primaryStart,
        chunk.primaryEnd,
        overlap,
        dynamicContext,
        apiKey,
        addLog
      );
      
      chunk.phaseARawCount = rawActions.length;

      if (cancelTokens.has(jobId)) {
        state.status = 'cancelled';
        bumpVersion(state);
        addLog('warn', 'Job cancelled by user after Phase A');
        return;
      }

      state.progress = progressBase + (50 / state.chunks.length) * 0.3;

      // Phase B: Validation & State
      chunk.status = 'analyzing_phase_b';
      bumpVersion(state);
      addLog('info', `Phase B: Validating and merging state...`);
      const primaryWindowStr = `${chunk.primaryStart}s-${chunk.primaryEnd}s`;
      const phaseBResult = await accumulateChunkPhaseB(
        videoUrl,
        `${duration}s`,
        rawActions,
        rawAnnotations,
        i + 1,
        primaryWindowStr,
        chatHistory,
        dynamicContext,
        apiKey,
        addLog
      );

      if (cancelTokens.has(jobId)) {
        state.status = 'cancelled';
        bumpVersion(state);
        addLog('warn', 'Job cancelled by user after Phase B');
        return;
      }

      let nextChatHistory = phaseBResult.newHistory;
      // Sliding window: keep only the last 60 items (30 turns: user + model) to leverage the large context window
      if (nextChatHistory.length > 60) {
        nextChatHistory = nextChatHistory.slice(-60);
        // GUARDRAIL: Ensure strict user/model alternation starting with 'user'
        while (nextChatHistory.length > 0 && nextChatHistory[0].role !== 'user') {
          nextChatHistory = nextChatHistory.slice(1);
        }
      }
      let nextUIState = phaseBResult.result.current_ui_state;
      
      // Append new validated actions
      const existingIds = new Set(cumulativeActions.map(a => a.id));
      const newValidatedEvents = (phaseBResult.result.validated_segment_events || []).map(action => {
        if (!action.id || existingIds.has(action.id) || !action.id.startsWith('evt_')) {
          action.id = `evt_${uuidv4().substring(0, 8)}`;
        }
        existingIds.add(action.id);
        return action;
      });
      let nextCumulativeActions = [...cumulativeActions, ...newValidatedEvents];

      // Append new validated annotations
      const rawValidatedAnnotations = phaseBResult.result.validated_segment_annotations || [];
      const EXPLICIT_PLACEHOLDER_RE = /^(no annotations|not extracted|none provided|no relevant annotations)\.?$/i;
      const GENERIC_PLACEHOLDER_RE = /^(none|n\/a|na|-)\.?$/i;
      
      const filteredAnnotations = rawValidatedAnnotations.filter(ann => {
        const content = ann.content?.trim() || '';
        if (!content) return false;
        
        if (EXPLICIT_PLACEHOLDER_RE.test(content)) return false;
        
        if (GENERIC_PLACEHOLDER_RE.test(content)) {
          const relevance = ann.relevance?.trim() || '';
          if (!relevance || GENERIC_PLACEHOLDER_RE.test(relevance) || EXPLICIT_PLACEHOLDER_RE.test(relevance)) {
            return false;
          }
        }
        return true;
      });
      
      const placeholderCount = rawValidatedAnnotations.length - filteredAnnotations.length;
      if (placeholderCount > 0) {
        addLog('info', `Filtered ${placeholderCount} placeholder annotations from chunk.`);
      }

      const existingAnnIds = new Set(cumulativeAnnotations.map(a => a.id));
      const newValidatedAnnotations = filteredAnnotations.map(ann => {
        if (!ann.id || existingAnnIds.has(ann.id) || !ann.id.startsWith('ann_')) {
          ann.id = `ann_${uuidv4().substring(0, 8)}`;
        }
        existingAnnIds.add(ann.id);
        return ann;
      });
      let nextCumulativeAnnotations = [...cumulativeAnnotations, ...newValidatedAnnotations];
      
      // --- Commit Phase A/B results ---
      chatHistory = nextChatHistory;
      state.chatHistory = chatHistory;

      const newActionsCount = nextCumulativeActions.length - cumulativeActions.length;
      for (let j = cumulativeActions.length; j < nextCumulativeActions.length; j++) {
        nextCumulativeActions[j].chunkIndex = i;
      }
      for (let j = cumulativeAnnotations.length; j < nextCumulativeAnnotations.length; j++) {
        nextCumulativeAnnotations[j].chunkIndex = i;
      }

      chunk.phaseBAddedCount = newActionsCount;
      chunk.actionCount = newActionsCount;
      chunk.status = 'completed';

      latestUIState = nextUIState;
      state.uiState = latestUIState;

      cumulativeActions = nextCumulativeActions;
      state.actions = cumulativeActions;

      cumulativeAnnotations = nextCumulativeAnnotations;
      state.annotations = cumulativeAnnotations;

      state.progress = ((i + 1) / state.chunks.length) * 50;
      state.currentChunkIndex = i + 1;
      addLog('success', `Chunk ${i + 1}/${state.chunks.length} Phase A/B complete. ${newActionsCount} new actions.`);
      bumpVersion(state);
    }

    // === PHASE C LOOP: Narrative synthesis with full action visibility ===
    const abComplete = state.currentChunkIndex >= state.chunks.length;
    const resumingPhaseC = isResuming && abComplete && state.narrationChunkIndex > 0;

    if (resumingPhaseC) {
      addLog('info', `Resuming Phase C from narration chunk ${state.narrationChunkIndex + 1}/${narrationChunks.length}. Preserving ${cumulativeNarrative.length} existing steps.`);
    } else {
      // Fresh Phase C — reset narrative to avoid duplicates
      cumulativeNarrative = [];
      state.narrativeSteps = cumulativeNarrative;
      state.learnedContext = "";
      state.narrationChunkIndex = 0;
    }

    const narrationStartIndex = resumingPhaseC ? state.narrationChunkIndex : 0;

    addLog('info', `Starting narrative synthesis: ${narrationChunks.length} narration chunks (starting at ${narrationStartIndex + 1}), ${cumulativeActions.length} total actions available.`);

    for (let i = narrationStartIndex; i < narrationChunks.length; i++) {
      if (cancelTokens.has(jobId)) {
        state.status = 'cancelled';
        bumpVersion(state);
        addLog('warn', `Job cancelled before Phase C chunk ${i + 1}/${narrationChunks.length}`);
        return;
      }

      const nChunk = narrationChunks[i];
      state.status = 'running_narrative';
      bumpVersion(state);
      addLog('info', `Phase C (${i + 1}/${narrationChunks.length}): Narrating ${formatMMSS(nChunk.primaryStart)}–${formatMMSS(nChunk.primaryEnd)}...`);

      const dynamicContext = customContext + (state.learnedContext ? "\n\nLearned Domain Knowledge:\n" + state.learnedContext : "");

      // Buffer extends beyond clip window to catch actions near boundaries.
      // For edge chunks (first/last), this may go negative or past duration —
      // that's intentional: parseMMSS returns non-negative values, so t >= -15
      // is always true, giving the edge chunk full visibility. Do NOT clamp to 0/duration.
      const CONTEXT_BUFFER_SEC = 15;
      const contextStart = nChunk.clipStart - CONTEXT_BUFFER_SEC;
      const contextEnd = nChunk.clipEnd + CONTEXT_BUFFER_SEC;

      const relevantActions = cumulativeActions.filter(a => {
        const t = parseMMSS(a.timestamp);
        return t >= contextStart && t <= contextEnd;
      });

      const relevantAnnotations = cumulativeAnnotations.filter(a => {
        const t = parseMMSS(a.timestamp);
        return t >= contextStart && t <= contextEnd;
      });

      let narrationResult = await analyzeNarrationSegment(
        videoUrl,
        nChunk.clipStart,
        nChunk.clipEnd,
        relevantActions,
        relevantAnnotations,
        dynamicContext,
        apiKey,
        cumulativeNarrative.slice(-10),
        addLog
      );

      // Retry once if empty steps but we had relevant actions
      if (narrationResult.steps.length === 0 && relevantActions.length > 0) {
        addLog('warn', `Phase C returned 0 steps despite having ${relevantActions.length} actions. Retrying...`);
        narrationResult = await analyzeNarrationSegment(
          videoUrl,
          nChunk.clipStart,
          nChunk.clipEnd,
          relevantActions,
          relevantAnnotations,
          dynamicContext,
          apiKey,
          cumulativeNarrative.slice(-10),
          addLog
        );
        if (narrationResult.steps.length > 0) {
          addLog('success', `Phase C retry yielded ${narrationResult.steps.length} steps.`);
        } else {
          addLog('warn', `Phase C retry also returned 0 steps. Actions in this range may be unlinked.`);
        }
      }

      if (cancelTokens.has(jobId)) {
        state.status = 'cancelled';
        bumpVersion(state);
        addLog('warn', `Job cancelled during Phase C (${i + 1}/${narrationChunks.length})`);
        return;
      }

      const newNarrativeStepsRaw = narrationResult.steps;
      const learned_insights = narrationResult.learned_insights;

      // Accumulate learned context (with dedup)
      if (learned_insights) {
        const currentInsights = state.learnedContext
          ? state.learnedContext.split('\n- ').map(ins => ins.replace(/^- /, '').trim().toLowerCase())
          : [];
        const newInsights = learned_insights.split('\n- ').map(ins => ins.replace(/^- /, '').trim());

        let insightsAdded = false;
        for (const insight of newInsights) {
          if (insight && !currentInsights.includes(insight.toLowerCase())) {
            state.learnedContext = (state.learnedContext ? state.learnedContext + "\n- " : "- ") + insight;
            insightsAdded = true;
          }
        }
        if (insightsAdded) bumpVersion(state);
      }

      // Assign step IDs
      const existingStepIds = new Set(cumulativeNarrative.map(s => s.id));
      const newNarrativeSteps = newNarrativeStepsRaw.map(step => {
        if (!step.id || existingStepIds.has(step.id) || !step.id.startsWith('step_')) {
          step.id = `step_${uuidv4().substring(0, 8)}`;
        }
        existingStepIds.add(step.id);
        return step;
      });

      cumulativeNarrative = [...cumulativeNarrative, ...newNarrativeSteps];
      state.narrativeSteps = cumulativeNarrative;

      // Commit Phase C progress for resumability
      state.narrationChunkIndex = i + 1;
      state.progress = 50 + ((i + 1) / narrationChunks.length) * 40;
      addLog('success', `Phase C (${i + 1}/${narrationChunks.length}): ${newNarrativeSteps.length} steps.`);
      bumpVersion(state);
    }

    // After all chunks are processed, before global dedup
    // [Change 1a: broken-link cleanup]
    const allActionIdsPreMerge = new Set(cumulativeActions.map(a => a.id));
    const allAnnotationIdsPreMerge = new Set(cumulativeAnnotations.map(a => a.id));
    
    for (const step of cumulativeNarrative) {
      step.linked_visual_action_ids = step.linked_visual_action_ids.filter((id: string) => allActionIdsPreMerge.has(id));
      if (step.linked_annotation_ids) {
        step.linked_annotation_ids = step.linked_annotation_ids.filter((id: string) => allAnnotationIdsPreMerge.has(id));
      }
    }

    // [Change 1b: Sort]
    const originalOrder = cumulativeNarrative.map(s => s.id).join(',');
    cumulativeNarrative.sort((a, b) => parseMMSS(a.timestamp) - parseMMSS(b.timestamp));
    if (cumulativeNarrative.map(s => s.id).join(',') !== originalOrder) {
      addLog('info', 'Sorted narrative steps by timestamp.');
    }

    // [Change 1c: Orphan identification]
    const nonProceduralTypes = new Set(['rationale', 'workflow_framing', 'tip', 'warning', 'comparison']);
    const orphans = cumulativeNarrative.filter(step => 
      step.linked_visual_action_ids.length === 0 && 
      (!step.linked_annotation_ids || step.linked_annotation_ids.length === 0) && 
      !nonProceduralTypes.has(step.insight_type)
    );
    
    addLog('info', `Found ${orphans.length} orphan explanation steps for merge analysis.`);

    // [Change 1d: Merge computation]
    const mergeInstructions: { orphanIndex: number, neighborIndex: number }[] = [];
    const orphanSet = new Set(orphans);
    
    for (let i = 0; i < cumulativeNarrative.length; i++) {
      const step = cumulativeNarrative[i];
      if (orphanSet.has(step)) {
        let bestNeighborIndex = -1;
        let bestJaccard = -1;
        
        for (let j = 0; j < cumulativeNarrative.length; j++) {
          if (i === j) continue;
          const neighbor = cumulativeNarrative[j];
          if (orphanSet.has(neighbor)) continue; // Only merge into non-orphans
          
          if (Math.abs(parseMMSS(neighbor.timestamp) - parseMMSS(step.timestamp)) <= 15) {
            const stepTopics = new Set((step.topics || []).map(t => t.toLowerCase()));
            const neighborTopics = new Set((neighbor.topics || []).map(t => t.toLowerCase()));
            
            const intersection = new Set([...stepTopics].filter(x => neighborTopics.has(x)));
            const union = new Set([...stepTopics, ...neighborTopics]);
            
            const jaccard = union.size === 0 ? 0 : intersection.size / union.size;
            
            if (jaccard >= 0.3) {
              if (jaccard > bestJaccard || (jaccard === bestJaccard && j < bestNeighborIndex)) {
                bestJaccard = jaccard;
                bestNeighborIndex = j;
              }
            }
          }
        }
        
        if (bestNeighborIndex !== -1) {
          mergeInstructions.push({ orphanIndex: i, neighborIndex: bestNeighborIndex });
        }
      }
    }

    const mergedOrphanIndices = new Set(mergeInstructions.map(m => m.orphanIndex));
    
    for (const { orphanIndex, neighborIndex } of mergeInstructions) {
      const orphan = cumulativeNarrative[orphanIndex];
      const neighbor = cumulativeNarrative[neighborIndex];
      
      const sep = /[.?!]$/.test(neighbor.explanation.trim()) ? ' ' : '. ';
      neighbor.explanation = neighbor.explanation.trim() + sep + orphan.explanation.trim();
      
      const combinedTopics = [...(neighbor.topics || []), ...(orphan.topics || [])];
      neighbor.topics = Array.from(new Set(combinedTopics));
    }
    
    cumulativeNarrative = cumulativeNarrative.filter((_, i) => !mergedOrphanIndices.has(i));
    state.narrativeSteps = cumulativeNarrative;
    
    addLog('info', `Merged ${mergeInstructions.length} orphan steps into linked neighbors. ${orphans.length - mergeInstructions.length} orphans had no eligible neighbor and were kept.`);

    // After all chunks are processed, before global dedup
    addLog('info', 'Validating narrative-action link coverage...');
    // Note: Primary broken-link cleanup happens in Step 1a above, but we keep this as a defensive second pass.

    const allActionIds = new Set(cumulativeActions.map(a => a.id));
    const allAnnotationIds = new Set(cumulativeAnnotations.map(a => a.id));
    let brokenLinks = 0;
    let unlinkedSteps = 0;

    for (const step of cumulativeNarrative) {
      // Remove references to IDs that don't exist in the action set
      const validLinks = step.linked_visual_action_ids.filter((id: string) => allActionIds.has(id));
      const broken = step.linked_visual_action_ids.length - validLinks.length;
      brokenLinks += broken;
      step.linked_visual_action_ids = validLinks;

      // Remove references to IDs that don't exist in the annotation set
      if (step.linked_annotation_ids) {
        const validAnnotationLinks = step.linked_annotation_ids.filter((id: string) => allAnnotationIds.has(id));
        const brokenAnnotations = step.linked_annotation_ids.length - validAnnotationLinks.length;
        brokenLinks += brokenAnnotations;
        step.linked_annotation_ids = validAnnotationLinks;
      }

      if (validLinks.length === 0 && (!step.linked_annotation_ids || step.linked_annotation_ids.length === 0) && !nonProceduralTypes.has(step.insight_type)) {
        unlinkedSteps++;
      }
    }

    const linkedActionIds = new Set(cumulativeNarrative.flatMap((s: NarrativeStep) => s.linked_visual_action_ids));
    const userActions = cumulativeActions.filter(a => a.actor === 'user' && !a.is_error_recovery);
    const unlinkedActions = userActions.filter(a => !linkedActionIds.has(a.id));

    const coveragePercent = userActions.length > 0 ? ((userActions.length - unlinkedActions.length) / userActions.length * 100).toFixed(1) : "100.0";
    addLog('info', `Link coverage: ${coveragePercent}% of user actions linked. ${brokenLinks} broken refs removed. ${unlinkedSteps} non-procedural steps with no links.`);

    if (unlinkedActions.length > userActions.length * 0.3) {
      addLog('warn', `Low link coverage (${coveragePercent}%). ${unlinkedActions.length} user actions have no narrative step.`);
    }

    if (cancelTokens.has(jobId)) {
      state.status = 'cancelled';
      bumpVersion(state);
      addLog('warn', 'Job cancelled by user before global deduplication');
      return;
    }

    // Final Global Deduplication Pass
    state.status = 'running_dedup';
    state.progress = 92;
    bumpVersion(state);
    addLog('info', `Phase D: Running final global deduplication pass on ${cumulativeActions.length} actions...`);
    
    let phaseDSucceeded = false;
    try {
      const deduplicatedActionsRaw = await analyzeGlobalDeduplication(
        cumulativeActions,
        cumulativeNarrative,
        latestUIState,
        customContext,
        apiKey,
        addLog,
        (pct) => {
          state.progress = pct;
        }
      );
      
      const seenDedupIds = new Set<string>();
      const idRenames = new Map<string, string>();
      const deduplicatedActions = deduplicatedActionsRaw.map(action => {
        const oldId = action.id;
        if (!action.id || seenDedupIds.has(action.id) || !action.id.startsWith('evt_')) {
          action.id = `evt_${uuidv4().substring(0, 8)}`;
          if (oldId) idRenames.set(oldId, action.id);
        }
        seenDedupIds.add(action.id);
        return action;
      });
      
      state.actions = deduplicatedActions;
      normalizeActionDefaults(state.actions);
      addLog('success', `Global deduplication complete. Final action count: ${deduplicatedActions.length}`);
      
      // After global dedup, remap narrative links for any removed duplicates
      if (deduplicatedActions.length < cumulativeActions.length) {
        const oldToNew = new Map<string, string>();
        const remainingIds = new Set(deduplicatedActions.map(a => a.id));
        const remainingOriginalActions = cumulativeActions.filter(a => remainingIds.has(a.id));
        
        for (const oldAction of cumulativeActions) {
          if (!remainingIds.has(oldAction.id)) {
            // This action was removed as a duplicate. Find the action that was kept.
            // We compare against the ORIGINAL versions of the kept actions to avoid 
            // issues with LLM normalization of detail/target fields.
            const oldTime = parseMMSS(oldAction.timestamp);
            
            // Find candidates within 2 seconds and with the same action_type
            const candidates = remainingOriginalActions.filter(a => {
              if (a.action_type !== oldAction.action_type) return false;
              const aTime = parseMMSS(a.timestamp);
              return Math.abs(aTime - oldTime) <= 2;
            });
            
            let keptAction = candidates[0];
            if (candidates.length > 1) {
              // Tie-breaker: find the most similar original action
              keptAction = candidates.reduce((best, current) => {
                const scoreCurrent = (current.target?.element === oldAction.target?.element ? 2 : 0) + 
                                     (current.target?.panel === oldAction.target?.panel ? 1 : 0) +
                                     (current.detail === oldAction.detail ? 3 : 0);
                const scoreBest = (best.target?.element === oldAction.target?.element ? 2 : 0) + 
                                  (best.target?.panel === oldAction.target?.panel ? 1 : 0) +
                                  (best.detail === oldAction.detail ? 3 : 0);
                return scoreCurrent > scoreBest ? current : best;
              });
            }
            
            if (keptAction) {
              oldToNew.set(oldAction.id, keptAction.id);
            }
          }
        }

        if (oldToNew.size > 0) {
          addLog('info', `Remapping ${oldToNew.size} narrative links for removed duplicates.`);
          const finalIds = new Set(deduplicatedActions.map(a => a.id));
          for (const step of cumulativeNarrative) {
            step.linked_visual_action_ids = step.linked_visual_action_ids
              .map((id: string) => oldToNew.get(id) ?? id)
              .filter((id: string) => finalIds.has(id));
          }
        }
      }

      if (idRenames.size > 0) {
        addLog('info', `Renamed ${idRenames.size} non-evt_ action IDs.`);
        for (const step of cumulativeNarrative) {
          step.linked_visual_action_ids = step.linked_visual_action_ids.map(
            (id: string) => idRenames.get(id) ?? id
          );
        }
      }

      phaseDSucceeded = true;
    } catch (dedupError: any) {
      addLog('warn', `Global deduplication failed, falling back to chunked actions. Error: ${dedupError.message}`);
      normalizeActionDefaults(state.actions);
      // We don't fail the whole job if the final polish step fails
    }

    try {
      const { result: cleaned, serializedSize } = cleanFinalOutput({
        actions: state.actions,
        annotations: state.annotations,
        narrativeSteps: cumulativeNarrative,
        learnedContext: state.learnedContext,
        metadata: {
          videoUrl: state.videoUrl,
          duration: state.duration,
          total_actions: state.actions.length,
          total_steps: cumulativeNarrative.length,
          total_annotations: state.annotations.length,
          deduplicated: phaseDSucceeded,  // false = pre-dedup data, may contain duplicates
          viewportResolution: detectViewportResolution(null)
        }
      });
      state.cleanedOutput = cleaned;
      if (!phaseDSucceeded) {
        addLog('warn', `Cleaned output generated from PRE-DEDUP data (Phase D failed). Export may contain duplicate actions.`);
      } else {
        addLog('info', `Cleaned output generated (${serializedSize} chars)`);
      }
    } catch (cleanErr: any) {
      addLog('warn', `Failed to generate cleaned output: ${cleanErr.message}`);
    }

    try {
      const actionsForDiag = phaseDSucceeded ? state.actions : cumulativeActions;
      const unlinked = detectUnlinkedActions(cumulativeNarrative, actionsForDiag);
      if (unlinked.likely_linking_failure) {
        addLog('warn', `Linking diagnosis: ${unlinked.diagnosis}`);
      } else if (unlinked.unlinked_count > 0) {
        addLog('info', `${unlinked.unlinked_count} visual actions not linked to any narrative step`);
      }

      const redundant = detectRedundantSteps(cumulativeNarrative);
      if (redundant.length > 0) {
        addLog('warn', `${redundant.length} potentially redundant narrative step(s) detected: ${
          redundant.map(r => `step ${r.index} ≈ step ${r.duplicateOf}`).join(', ')
        }`);
      }
    } catch (diagErr: any) {
      addLog('info', `Diagnostic analysis skipped: ${diagErr.message}`);
    }

    state.progress = 100;
    state.status = 'completed';
    bumpVersion(state);
    addLog('success', 'Workflow analysis completed successfully!');

  } catch (error: any) {
    console.error(`Job ${jobId} failed:`, error);
    state.status = 'error';
    state.error = error.message || 'Unknown error occurred';
    addLog('error', `Fatal error: ${state.error}`);

    // Mark the current chunk as errored
    const currentChunk = state.chunks[state.currentChunkIndex];
    if (currentChunk && currentChunk.status !== 'completed') {
      currentChunk.status = 'error';
      currentChunk.errorMsg = state.error;
    }
    bumpVersion(state);
  } finally {
    if (jobs.get(jobId) === state && state.runId === runId) {
      cancelTokens.delete(jobId);
      const JOB_TTL_MS = 60 * 60 * 1000;
      if (state.ttlTimerId) {
        clearTimeout(state.ttlTimerId);
      }
      state.ttlTimerId = setTimeout(() => {
        const currentState = jobs.get(jobId);
        if (currentState && currentState.runId === runId) {
          jobs.delete(jobId);
        }
      }, JOB_TTL_MS);
    }
  }
}
