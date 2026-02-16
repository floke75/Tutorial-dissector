
import React, { useState, useEffect, useRef } from 'react';
import { InputPanel } from './InputPanel';
import { ChunkVisualizer } from './ChunkVisualizer';
import { ResultsTimeline } from './ResultsTimeline';
import { computeChunkWindows, parseMMSS, formatMMSS } from '../utils/timeUtils';
import { analyzeChunkPhaseA, accumulateChunkPhaseB, analyzeNarrationSegment } from '../services/geminiService';
import { getProject, saveProject } from '../services/storage';
import { Chunk, ProcessingState, ActionItem, PhaseBResponse, Project } from '../types';

interface AnalysisViewProps {
  projectId: string;
  onBack: () => void;
}

// 15 minutes = 900 seconds. Large enough for context, safe for tokens.
const NARRATION_CHUNK_SIZE_SEC = 900; 

export const AnalysisView: React.FC<AnalysisViewProps> = ({ projectId, onBack }) => {
  // Config State
  const [projectName, setProjectName] = useState('Untitled Project');
  const [videoUrl, setVideoUrl] = useState('');
  const [durationInput, setDurationInput] = useState('');
  const [chunkSize, setChunkSize] = useState(300); // 5 mins
  const [overlap, setOverlap] = useState(60);
  const [isLoaded, setIsLoaded] = useState(false);

  // Runtime State
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [procState, setProcState] = useState<ProcessingState>({
    status: 'idle',
    currentChunkIndex: 0,
    narrationStartTime: 0,
    totalActions: 0,
    totalTokens: 0,
    startTime: null,
    lastInteractionId: null
  });

  // UI State
  const [latestUIState, setLatestUIState] = useState<PhaseBResponse['current_ui_state'] | null>(null);

  // Timing stats for UI
  const [elapsedTime, setElapsedTime] = useState(0);
  
  // Refs for loop control to avoid closure staleness
  const stateRef = useRef(procState);
  stateRef.current = procState;
  
  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load Project Data
  useEffect(() => {
    const data = getProject(projectId);
    if (data) {
      setProjectName(data.name);
      setVideoUrl(data.videoUrl);
      setDurationInput(data.durationInput);
      setChunkSize(data.chunkSize);
      setOverlap(data.overlap);
      setChunks(data.chunks);
      setActions(data.actions);
      setProcState(data.procState);
      setLatestUIState(data.latestUIState);
    }
    setIsLoaded(true);
  }, [projectId]);

  // Auto-save logic
  useEffect(() => {
    if (!isLoaded) return;
    
    const saveData: Project = {
      id: projectId,
      name: projectName,
      updatedAt: Date.now(),
      videoUrl,
      durationInput,
      chunkSize,
      overlap,
      chunks,
      actions,
      procState,
      latestUIState,
      status: procState.status, 
      actionCount: actions.length
    };
    saveProject(saveData);
  }, [projectName, videoUrl, durationInput, chunkSize, overlap, chunks, actions, procState, latestUIState, projectId, isLoaded]);

  // Plan Calculation
  useEffect(() => {
    if (durationInput && parseMMSS(durationInput) > 0 && procState.status === 'idle') {
      const duration = parseMMSS(durationInput);
      // Only recalculate if chunks are empty or we are in idle setup mode
      if (chunks.length === 0 || (procState.currentChunkIndex === 0 && chunks.every(c => c.status === 'pending'))) {
         setChunks(computeChunkWindows(duration, chunkSize, overlap));
      }
    }
  }, [durationInput, chunkSize, overlap, procState.status]);

  // Timer Effect
  useEffect(() => {
    const isRunning = procState.status === 'running_visual' || procState.status === 'running_narration';
    if (isRunning) {
      timerRef.current = setInterval(() => {
        if (stateRef.current.startTime) {
          const elapsed = Date.now() - stateRef.current.startTime;
          setElapsedTime(elapsed);
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [procState.status]);

  const handleStart = () => {
    const duration = parseMMSS(durationInput);
    if (duration <= 0) {
      alert("Please enter a valid duration (MM:SS)");
      return;
    }
    if (!videoUrl) {
      alert("Please enter a YouTube URL");
      return;
    }

    if (procState.status === 'idle' || procState.status === 'completed') {
       const newChunks = computeChunkWindows(duration, chunkSize, overlap);
       setChunks(newChunks);
       chunksRef.current = newChunks; 
       setActions([]);
       setProcState({
        status: 'running_visual',
        currentChunkIndex: 0,
        narrationStartTime: 0,
        totalActions: 0,
        totalTokens: 0,
        startTime: Date.now(),
        lastInteractionId: null
      });
    } else if (procState.status === 'paused') {
      const resumeStatus = chunks.some(c => c.status !== 'completed') ? 'running_visual' : 'running_narration';
      setProcState(prev => ({
        ...prev,
        status: resumeStatus,
        startTime: prev.startTime || Date.now() 
      }));
    }
  };

  const sortActions = (a: ActionItem, b: ActionItem) => {
     const timeA = parseMMSS(a.timestamp);
     const timeB = parseMMSS(b.timestamp);
     return timeA - timeB;
  };

  // --------------------------------------------------------------------------------
  // LOOP 1: VISUAL ANALYSIS
  // --------------------------------------------------------------------------------
  useEffect(() => {
    let active = true;

    const processNextVisual = async () => {
      const { status, currentChunkIndex, lastInteractionId } = stateRef.current;
      const currentChunks = chunksRef.current.length > 0 ? chunksRef.current : chunks;

      if (status !== 'running_visual' || !active) return;
      
      console.log(`[Visual] Processing Chunk ${currentChunkIndex + 1} / ${currentChunks.length}`);

      // Check if visual phase is done
      if (currentChunkIndex >= currentChunks.length) {
        console.log("Visual Phase Complete. Switching to Narration Phase.");
        setProcState(s => ({ 
            ...s, 
            status: 'running_narration', 
            narrationStartTime: 0 
        }));
        return;
      }

      const chunk = currentChunks[currentChunkIndex];

      try {
        setChunks(prev => prev.map((c, i) => i === currentChunkIndex ? { ...c, status: 'analyzing_phase_a' } : c));

        const phaseAActions = await analyzeChunkPhaseA(
          videoUrl,
          chunk.clipStart,
          chunk.clipEnd,
          chunk.primaryStart,
          chunk.primaryEnd,
          overlap
        );

        if (!active) return;

        setChunks(prev => prev.map((c, i) => i === currentChunkIndex ? { 
          ...c, 
          status: 'analyzing_phase_b',
          phaseARawCount: phaseAActions.length 
        } : c));

        const primaryWindowStr = `${chunk.primaryStart}s-${chunk.primaryEnd}s`;
        const { interactionId, result } = await accumulateChunkPhaseB(
          videoUrl,
          durationInput,
          phaseAActions,
          currentChunkIndex + 1,
          primaryWindowStr,
          lastInteractionId
        );

        if (!active) return;
        
        const mergedVisualActions = result.validated_segment_events ?? phaseAActions;
        const addedVisualCount = result.new_actions_added ?? mergedVisualActions.length;
        setLatestUIState(result.current_ui_state);

        setChunks(prev => prev.map((c, i) => i === currentChunkIndex ? { 
          ...c, 
          status: 'completed', 
          phaseBAddedCount: addedVisualCount,
          interactionId: interactionId,
          actionCount: mergedVisualActions.length 
        } : c));

        const taggedActions = mergedVisualActions.map(a => ({ ...a, chunkIndex: chunk.index }));
        setActions(prev => [...prev, ...taggedActions].sort(sortActions));

        setProcState(prev => ({
          ...prev,
          currentChunkIndex: prev.currentChunkIndex + 1,
          lastInteractionId: interactionId,
          totalActions: prev.totalActions + mergedVisualActions.length,
          totalTokens: prev.totalTokens + 87000
        }));

      } catch (err) {
        console.error("Visual Processing Error:", err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        setChunks(prev => prev.map((c, i) => i === currentChunkIndex ? { ...c, status: 'error', errorMsg } : c));
        setProcState(prev => ({ ...prev, status: 'paused' })); 
      }
    };

    if (procState.status === 'running_visual') {
      processNextVisual();
    }

    return () => { active = false; };
  }, [procState.status, procState.currentChunkIndex]);


  // --------------------------------------------------------------------------------
  // LOOP 2: NARRATION ANALYSIS (With Context Anchoring)
  // --------------------------------------------------------------------------------
  useEffect(() => {
    let active = true;

    const processNextNarration = async () => {
      const { status, narrationStartTime } = stateRef.current;
      const totalDuration = parseMMSS(durationInput);

      if (status !== 'running_narration' || !active) return;

      if (narrationStartTime >= totalDuration) {
        setProcState(s => ({ ...s, status: 'completed' }));
        return;
      }

      const endSec = Math.min(narrationStartTime + NARRATION_CHUNK_SIZE_SEC, totalDuration);
      
      console.log(`[Narration] Processing ${formatMMSS(narrationStartTime)} - ${formatMMSS(endSec)}`);

      try {
        // Filter relevant visual actions for context
        // We use a WIDER buffer (+/- 15s) here so the model can see visual events 
        // that the narration refers to even if they happen significantly before or after the speech.
        const relevantActions = actionsRef.current.filter(a => {
           const t = parseMMSS(a.timestamp);
           return t >= (narrationStartTime - 15) && t < (endSec + 15) && a.action_type !== 'narration';
        });

        const narrationActions = await analyzeNarrationSegment(
           videoUrl,
           narrationStartTime,
           endSec,
           relevantActions
        );

        if (!active) return;

        if (narrationActions.length > 0) {
            setActions(prev => [...prev, ...narrationActions].sort(sortActions));
            setProcState(prev => ({
              ...prev,
              totalActions: prev.totalActions + narrationActions.length,
              totalTokens: prev.totalTokens + 300000 // Approximate tokens for large chunk
            }));
        }

        setProcState(prev => ({
           ...prev,
           narrationStartTime: endSec
        }));

      } catch (err) {
         console.error("Narration Error:", err);
         setProcState(prev => ({ ...prev, status: 'paused' }));
      }
    };

    if (procState.status === 'running_narration') {
      processNextNarration();
    }

    return () => { active = false; };
  }, [procState.status, procState.narrationStartTime]);


  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return `${h > 0 ? h + ':' : ''}${m % 60}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const isVisualRunning = procState.status === 'running_visual';
  const isNarrationRunning = procState.status === 'running_narration';

  return (
    <div className="flex flex-col h-full gap-6 overflow-hidden">
      {/* Upper Area: Sidebar + Timeline */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Sidebar (Scrollable) */}
        <div className="lg:col-span-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
          <InputPanel
            videoUrl={videoUrl}
            setVideoUrl={setVideoUrl}
            durationInput={durationInput}
            setDurationInput={setDurationInput}
            chunkSize={chunkSize}
            setChunkSize={setChunkSize}
            overlap={overlap}
            setOverlap={setOverlap}
            onStart={handleStart}
            disabled={isVisualRunning || isNarrationRunning}
            onBack={onBack}
            projectName={projectName}
            setProjectName={setProjectName}
          />
          
          {procState.status !== 'idle' && (
              <div className="bg-gray-850 p-6 rounded-xl border border-gray-750 shadow-lg">
                <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">Processing Stats</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span className={`font-mono font-bold ${
                        isVisualRunning ? 'text-blue-400 animate-pulse' :
                        isNarrationRunning ? 'text-pink-400 animate-pulse' :
                        procState.status === 'completed' ? 'text-green-400' :
                        'text-gray-300'
                    }`}>
                      {procState.status === 'running_visual' ? 'VISUAL ANALYSIS' :
                       procState.status === 'running_narration' ? 'AUDIO NARRATION' :
                       procState.status.toUpperCase()}
                    </span>
                  </div>

                  {isNarrationRunning && (
                    <div className="flex justify-between items-center text-pink-300/80">
                      <span className="text-xs">Audio Progress</span>
                      <span className="font-mono text-xs">
                         {formatMMSS(procState.narrationStartTime)} / {durationInput}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-gray-500">Elapsed</span>
                    <span className="font-mono text-gray-200">{formatTime(elapsedTime)}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-500">Actions Found</span>
                    <span className="font-mono text-blue-300">{procState.totalActions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Est. Token Usage</span>
                    <span className="font-mono text-purple-300">{Math.round(procState.totalTokens / 1000)}k</span>
                  </div>
                </div>
              </div>
          )}
          
          {latestUIState && (
              <div className="bg-gray-850 p-6 rounded-xl border border-gray-750 shadow-lg">
                <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">Detected Context</h3>
                <div className="space-y-2 text-xs">
                  <p><strong className="text-gray-500">App:</strong> {latestUIState.application}</p>
                  <p><strong className="text-gray-500">File:</strong> {latestUIState.active_file || 'None'}</p>
                  <p><strong className="text-gray-500">Tool:</strong> {latestUIState.active_tool || 'None'}</p>
                </div>
              </div>
          )}
        </div>

        {/* Timeline Area */}
        <div className="lg:col-span-2 flex flex-col h-full min-h-0">
          <ResultsTimeline actions={actions} />
        </div>
      </div>

      {/* Bottom Area */}
      <div className="shrink-0">
         <ChunkVisualizer chunks={chunks} />
      </div>
    </div>
  );
};
