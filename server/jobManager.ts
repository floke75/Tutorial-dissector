import { v4 as uuidv4 } from 'uuid';
import { analyzeChunkPhaseA, accumulateChunkPhaseB, analyzeNarrationSegment, analyzeGlobalDeduplication } from '../services/geminiService.ts';
import type { ActionItem, VideoAnnotation, NarrativeStep, ProcessingState, UIState, LogLevel } from '../types.ts';
import { computeChunkWindows, parseMMSS } from '../utils/timeUtils.ts';
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

  const state = jobs.get(jobId)!;
  const runId = state.runId;

  if (isResuming) {
    addLog('info', `Resuming job from chunk ${state.currentChunkIndex + 1}...`);
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
      const progressBase = (i / state.chunks.length) * 100;
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

      state.progress = progressBase + (100 / state.chunks.length) * 0.3;

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
        if (!action.id || existingIds.has(action.id)) {
          action.id = `evt_${uuidv4().substring(0, 8)}`;
        }
        existingIds.add(action.id);
        return action;
      });
      let nextCumulativeActions = [...cumulativeActions, ...newValidatedEvents];

      // Append new validated annotations
      const existingAnnIds = new Set(cumulativeAnnotations.map(a => a.id));
      const newValidatedAnnotations = (phaseBResult.result.validated_segment_annotations || []).map(ann => {
        if (!ann.id || existingAnnIds.has(ann.id)) {
          ann.id = `ann_${uuidv4().substring(0, 8)}`;
        }
        existingAnnIds.add(ann.id);
        return ann;
      });
      let nextCumulativeAnnotations = [...cumulativeAnnotations, ...newValidatedAnnotations];
      
      // Phase C: Narrative Synthesis
      state.status = 'running_narrative';
      chunk.status = 'analyzing_phase_c';
      bumpVersion(state);
      addLog('info', `Phase C: Synthesizing narrative steps...`);
      
      const CONTEXT_BUFFER_SEC = 15;
      const contextStart = chunk.clipStart - CONTEXT_BUFFER_SEC;
      const contextEnd   = chunk.clipEnd   + CONTEXT_BUFFER_SEC;

      const relevantActions = nextCumulativeActions.filter(a => {
        const t = parseMMSS(a.timestamp);
        return t >= contextStart && t <= contextEnd;
      });
      
      const relevantAnnotations = nextCumulativeAnnotations.filter(a => {
        const t = parseMMSS(a.timestamp);
        return t >= contextStart && t <= contextEnd;
      });

      let narrationResult = await analyzeNarrationSegment(
        videoUrl,
        chunk.clipStart,
        chunk.clipEnd,
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
          chunk.clipStart,
          chunk.clipEnd,
          relevantActions,
          relevantAnnotations,
          dynamicContext,
          apiKey,
          cumulativeNarrative.slice(-10),
          addLog
        );
      }

      const { steps: newNarrativeStepsRaw, learned_insights } = narrationResult;

      if (learned_insights) {
        const currentInsights = state.learnedContext ? state.learnedContext.split('\n- ').map(i => i.replace(/^- /, '').trim().toLowerCase()) : [];
        const newInsights = learned_insights.split('\n- ').map(i => i.replace(/^- /, '').trim());
        
        let insightsAdded = false;
        for (const insight of newInsights) {
          if (insight && !currentInsights.includes(insight.toLowerCase())) {
            state.learnedContext = (state.learnedContext ? state.learnedContext + "\n- " : "- ") + insight;
            insightsAdded = true;
          }
        }
        if (insightsAdded) bumpVersion(state);
      }
      
      const existingStepIds = new Set(cumulativeNarrative.map(s => s.id));
      const newNarrativeSteps = newNarrativeStepsRaw.map(step => {
        // Unconditionally assign a consistent hex ID to avoid mixed formats from the model
        step.id = `step_${uuidv4().substring(0, 8)}`;
        existingStepIds.add(step.id);
        return step;
      });

      if (cancelTokens.has(jobId)) {
        state.status = 'cancelled';
        bumpVersion(state);
        addLog('warn', 'Job cancelled by user after Phase C');
        return;
      }

      // Atomic state update for the chunk
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

      cumulativeNarrative = [...cumulativeNarrative, ...newNarrativeSteps];
      state.narrativeSteps = cumulativeNarrative;

      state.progress = progressBase + (100 / state.chunks.length);
      addLog('success', `Chunk ${i + 1} completed successfully.`);
      state.currentChunkIndex = i + 1;
      bumpVersion(state);
    }

    // After all chunks are processed, before global dedup
    addLog('info', 'Validating narrative-action link coverage...');

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

      if (validLinks.length === 0 && (!step.linked_annotation_ids || step.linked_annotation_ids.length === 0) && step.insight_type !== 'rationale') {
        unlinkedSteps++;
      }
    }

    const linkedActionIds = new Set(cumulativeNarrative.flatMap((s: NarrativeStep) => s.linked_visual_action_ids));
    const userActions = cumulativeActions.filter(a => a.actor === 'user' && !a.is_error_recovery);
    const unlinkedActions = userActions.filter(a => !linkedActionIds.has(a.id));

    const coveragePercent = userActions.length > 0 ? ((userActions.length - unlinkedActions.length) / userActions.length * 100).toFixed(1) : "100.0";
    addLog('info', `Link coverage: ${coveragePercent}% of user actions linked. ${brokenLinks} broken refs removed. ${unlinkedSteps} non-rationale steps with no links.`);

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
      const deduplicatedActions = deduplicatedActionsRaw.map(action => {
        if (!action.id || seenDedupIds.has(action.id)) {
          action.id = `evt_${uuidv4().substring(0, 8)}`;
        }
        seenDedupIds.add(action.id);
        return action;
      });
      
      state.actions = deduplicatedActions;
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
      phaseDSucceeded = true;
    } catch (dedupError: any) {
      addLog('warn', `Global deduplication failed, falling back to chunked actions. Error: ${dedupError.message}`);
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
          totalActions: state.actions.length,
          totalSteps: cumulativeNarrative.length,
          totalAnnotations: state.annotations.length,
          deduplicated: phaseDSucceeded  // false = pre-dedup data, may contain duplicates
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
