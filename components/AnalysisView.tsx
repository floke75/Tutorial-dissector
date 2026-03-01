
import React, { useState, useEffect, useRef } from 'react';
import { InputPanel } from './InputPanel';
import { ChunkVisualizer } from './ChunkVisualizer';
import { ResultsTimeline } from './ResultsTimeline';
import { DevConsole } from './DevConsole';
import { ThemeToggle } from './ThemeToggle';
import { ArrowLeft, LayoutPanelLeft } from 'lucide-react';
import { computeChunkWindows, parseMMSS, formatMMSS } from '../utils/timeUtils';
import { analyzeChunkPhaseA, accumulateChunkPhaseB, analyzeNarrationSegment } from '../services/geminiService';
import { getProject, saveProject } from '../services/storage';
import { Chunk, ProcessingState, ActionItem, NarrativeStep, PhaseBResponse, Project, LogLevel } from '../types';

interface AnalysisViewProps {
  projectId: string;
  onBack: () => void;
}

const NARRATION_CHUNK_SIZE_SEC = 900; 

export const AnalysisView: React.FC<AnalysisViewProps> = ({ projectId, onBack }) => {
  // Config State
  const [projectName, setProjectName] = useState('Untitled Project');
  const [videoUrl, setVideoUrl] = useState('');
  const [durationInput, setDurationInput] = useState('');
  const [chunkSize, setChunkSize] = useState(300); 
  const [overlap, setOverlap] = useState(60);
  const [customContext, setCustomContext] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  // Runtime State
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [narrativeSteps, setNarrativeSteps] = useState<NarrativeStep[]>([]);
  const [procState, setProcState] = useState<ProcessingState>({
    status: 'idle',
    currentChunkIndex: 0,
    narrationStartTime: 0,
    totalActions: 0,
    totalTokens: 0,
    startTime: null,
    lastInteractionId: null,
    chatHistory: [],
    logs: []
  });

  // UI State
  const [latestUIState, setLatestUIState] = useState<PhaseBResponse['current_ui_state'] | null>(null);

  // Timing stats for UI
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const stateRef = useRef(procState);
  stateRef.current = procState;
  
  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const data = getProject(projectId);
    if (data) {
      setProjectName(data.name);
      setVideoUrl(data.videoUrl);
      setDurationInput(data.durationInput);
      setChunkSize(data.chunkSize);
      setOverlap(data.overlap);
      setCustomContext(data.customContext || '');
      setChunks(data.chunks);
      setActions(data.actions);
      setNarrativeSteps(data.narrativeSteps || []);
      setProcState(data.procState);
      setLatestUIState(data.latestUIState);
    }
    setIsLoaded(true);
  }, [projectId]);

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
      customContext,
      chunks,
      actions,
      narrativeSteps,
      procState,
      latestUIState,
      status: procState.status, 
      actionCount: actions.length
    };
    saveProject(saveData);
  }, [projectName, videoUrl, durationInput, chunkSize, overlap, customContext, chunks, actions, narrativeSteps, procState, latestUIState, projectId, isLoaded]);

  useEffect(() => {
    if (durationInput && parseMMSS(durationInput) > 0 && procState.status === 'idle') {
      const duration = parseMMSS(durationInput);
      if (chunks.length === 0 || (procState.currentChunkIndex === 0 && chunks.every(c => c.status === 'pending'))) {
         setChunks(computeChunkWindows(duration, chunkSize, overlap));
      }
    }
  }, [durationInput, chunkSize, overlap, procState.status]);

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

  // System Logger
  const handleLog = (level: LogLevel, message: string, data?: any) => {
    setProcState(prev => {
      const newLog = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        level,
        message,
        data
      };
      return { ...prev, logs: [...(prev.logs || []), newLog] };
    });
  };

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
       handleLog('info', 'Initializing new analysis pipeline...', { duration, chunkSize, overlap });
       const newChunks = computeChunkWindows(duration, chunkSize, overlap);
       setChunks(newChunks);
       chunksRef.current = newChunks; 
       setActions([]);
       setNarrativeSteps([]);
       setProcState(prev => ({
        status: 'running_visual',
        currentChunkIndex: 0,
        narrationStartTime: 0,
        totalActions: 0,
        totalTokens: 0,
        startTime: Date.now(),
        lastInteractionId: null,
        chatHistory: [],
        logs: prev.logs // retain logs on restart
      }));
    } else if (procState.status === 'paused') {
      handleLog('info', 'Resuming analysis pipeline...');
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
      const { status, currentChunkIndex, chatHistory } = stateRef.current;
      const currentChunks = chunksRef.current.length > 0 ? chunksRef.current : chunks;

      if (status !== 'running_visual' || !active) return;
      
      if (currentChunkIndex >= currentChunks.length) {
        handleLog('success', 'Visual Phase Complete. Transitioning to Narration track.');
        setProcState(s => ({ 
            ...s, 
            status: 'running_narration', 
            narrationStartTime: 0 
        }));
        return;
      }

      const chunk = currentChunks[currentChunkIndex];
      handleLog('info', `[Orchestrator] Starting Visual Pipeline for Chunk ${currentChunkIndex + 1}/${currentChunks.length}`);

      try {
        setChunks(prev => prev.map((c, i) => i === currentChunkIndex ? { ...c, status: 'analyzing_phase_a' } : c));

        const phaseAActions = await analyzeChunkPhaseA(
          videoUrl,
          chunk.clipStart,
          chunk.clipEnd,
          chunk.primaryStart,
          chunk.primaryEnd,
          overlap,
          customContext,
          handleLog
        );

        if (!active) return;

        setChunks(prev => prev.map((c, i) => i === currentChunkIndex ? { 
          ...c, 
          status: 'analyzing_phase_b',
          phaseARawCount: phaseAActions.length 
        } : c));

        const primaryWindowStr = `${chunk.primaryStart}s-${chunk.primaryEnd}s`;
        const { newHistory, result } = await accumulateChunkPhaseB(
          videoUrl,
          durationInput,
          phaseAActions,
          currentChunkIndex + 1,
          primaryWindowStr,
          chatHistory || [],
          customContext,
          handleLog
        );

        if (!active) return;
        
        const mergedVisualActions = result.validated_segment_events ?? phaseAActions;
        const addedVisualCount = result.new_actions_added ?? mergedVisualActions.length;
        setLatestUIState(result.current_ui_state);

        setChunks(prev => prev.map((c, i) => i === currentChunkIndex ? { 
          ...c, 
          status: 'completed', 
          phaseBAddedCount: addedVisualCount,
          actionCount: mergedVisualActions.length 
        } : c));

        const taggedActions = mergedVisualActions.map(a => ({ ...a, chunkIndex: chunk.index }));
        setActions(prev => [...prev, ...taggedActions].sort(sortActions));

        setProcState(prev => ({
          ...prev,
          currentChunkIndex: prev.currentChunkIndex + 1,
          chatHistory: newHistory,
          totalActions: prev.totalActions + mergedVisualActions.length,
          totalTokens: prev.totalTokens + 87000
        }));

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        handleLog('error', `[Orchestrator] Visual Loop Paused due to fatal error.`, { error: errorMsg });
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
        handleLog('success', 'Narration Phase Complete. Execution Graph is fully built.');
        setProcState(s => ({ ...s, status: 'completed' }));
        return;
      }

      const endSec = Math.min(narrationStartTime + NARRATION_CHUNK_SIZE_SEC, totalDuration);
      handleLog('info', `[Orchestrator] Starting Narration Pipeline for ${formatMMSS(narrationStartTime)} to ${formatMMSS(endSec)}`);

      try {
        const relevantActions = actionsRef.current.filter(a => {
           const t = parseMMSS(a.timestamp);
           return t >= (narrationStartTime - 15) && t < (endSec + 15) && a.action_type !== 'chunk_boundary';
        });

        const newSteps = await analyzeNarrationSegment(
           videoUrl,
           narrationStartTime,
           endSec,
           relevantActions,
           customContext,
           handleLog
        );

        if (!active) return;

        if (newSteps.length > 0) {
            setNarrativeSteps(prev => [...prev, ...newSteps].sort((a,b) => parseMMSS(a.timestamp) - parseMMSS(b.timestamp)));
            setProcState(prev => ({
              ...prev,
              totalTokens: prev.totalTokens + 300000 
            }));
        }

        setProcState(prev => ({
           ...prev,
           narrationStartTime: endSec
        }));

      } catch (err) {
         handleLog('error', `[Orchestrator] Narration Loop Paused due to fatal error.`, { error: String(err) });
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

  const [showSidebar, setShowSidebar] = useState(true);

  // Auto-hide sidebar when completed
  useEffect(() => {
    if (procState.status === 'completed') {
      setShowSidebar(false);
    }
  }, [procState.status]);

  return (
    <div className="flex flex-col h-full overflow-hidden relative bg-transparent">
      {/* Top Navigation Bar */}
      <div className="shrink-0 h-16 px-6 border-b border-gray-200/50 dark:border-gray-800/50 bg-white/60 dark:bg-gray-900/60 backdrop-blur-md flex items-center justify-between z-20 shadow-sm dark:shadow-black/10">
        <div className="flex items-center gap-6">
          <button 
            onClick={onBack}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-2 transition-colors font-medium"
          >
            <ArrowLeft size={18} /> Dashboard
          </button>
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700"></div>
          <input 
            type="text" 
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Untitled Project"
            className="bg-transparent border-none text-lg font-semibold text-gray-900 dark:text-white focus:outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600 w-64"
          />
          <span className="text-[10px] text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 font-medium uppercase tracking-wider">
            Autosave
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${showSidebar ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          >
            <LayoutPanelLeft size={18} />
            {showSidebar ? 'Hide Settings' : 'Show Settings'}
          </button>
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700"></div>
          <ThemeToggle />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex">
        {/* Sidebar */}
        {showSidebar && (
          <div className="w-80 lg:w-96 shrink-0 border-r border-gray-200/50 dark:border-gray-800/50 bg-white/40 dark:bg-gray-900/40 backdrop-blur-sm overflow-y-auto custom-scrollbar p-6 space-y-6 shadow-[4px_0_24px_rgba(0,0,0,0.02)] dark:shadow-black/20 z-10">
            <InputPanel
              videoUrl={videoUrl}
              setVideoUrl={setVideoUrl}
              durationInput={durationInput}
              setDurationInput={setDurationInput}
              chunkSize={chunkSize}
              setChunkSize={setChunkSize}
              overlap={overlap}
              setOverlap={setOverlap}
              customContext={customContext}
              setCustomContext={setCustomContext}
              onStart={handleStart}
              disabled={isVisualRunning || isNarrationRunning}
            />
            
            {procState.status !== 'idle' && (
              <div className="bg-white/70 dark:bg-gray-850/70 backdrop-blur-md p-6 rounded-2xl border border-gray-200/50 dark:border-gray-800/50 shadow-md dark:shadow-black/20">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-4 uppercase tracking-wider">Processing Stats</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-500">Status</span>
                    <span className={`font-mono font-medium ${
                        isVisualRunning ? 'text-blue-600 dark:text-blue-400 animate-pulse' :
                        isNarrationRunning ? 'text-pink-600 dark:text-pink-400 animate-pulse' :
                        procState.status === 'completed' ? 'text-emerald-600 dark:text-emerald-400' :
                        'text-gray-500 dark:text-gray-400'
                    }`}>
                      {procState.status === 'running_visual' ? 'VISUAL ANALYSIS' :
                       procState.status === 'running_narration' ? 'AUDIO NARRATION' :
                       procState.status.toUpperCase()}
                    </span>
                  </div>

                  {isNarrationRunning && (
                    <div className="flex justify-between items-center text-pink-600/80 dark:text-pink-300/80">
                      <span className="text-xs">Audio Progress</span>
                      <span className="font-mono text-xs">
                         {formatMMSS(procState.narrationStartTime)} / {durationInput}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-500">Elapsed</span>
                    <span className="font-mono text-gray-900 dark:text-gray-200">{formatTime(elapsedTime)}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-500">Actions Found</span>
                    <span className="font-mono text-blue-600 dark:text-blue-300">{procState.totalActions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-500">Est. Token Usage</span>
                    <span className="font-mono text-purple-600 dark:text-purple-300">{Math.round(procState.totalTokens / 1000)}k</span>
                  </div>
                </div>
              </div>
          )}
          
          {latestUIState && (
              <div className="bg-white/70 dark:bg-gray-850/70 backdrop-blur-md p-6 rounded-2xl border border-gray-200/50 dark:border-gray-800/50 shadow-md dark:shadow-black/20">
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-4 uppercase tracking-wider">Detected Context</h3>
                <div className="space-y-2 text-xs">
                  <p><strong className="text-gray-600 dark:text-gray-500">App:</strong> <span className="text-gray-900 dark:text-gray-300">{latestUIState.application}</span></p>
                  <p><strong className="text-gray-600 dark:text-gray-500">File:</strong> <span className="text-gray-900 dark:text-gray-300">{latestUIState.active_file || 'None'}</span></p>
                  <p><strong className="text-gray-600 dark:text-gray-500">Tool:</strong> <span className="text-gray-900 dark:text-gray-300">{latestUIState.active_tool || 'None'}</span></p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Timeline & Visualizer Area */}
        <div className="flex-1 min-w-0 flex flex-col p-6 gap-6 overflow-hidden">
          <div className="flex-1 min-h-0">
            <ResultsTimeline actions={actions} narrativeSteps={narrativeSteps} />
          </div>
          
          {procState.status !== 'idle' && procState.status !== 'completed' && (
            <div className="shrink-0">
               <ChunkVisualizer chunks={chunks} />
            </div>
          )}
        </div>
      </div>

      {/* Dev Console */}
      <DevConsole 
         logs={procState.logs || []} 
         onClear={() => setProcState(prev => ({ ...prev, logs: [] }))} 
      />
    </div>
  );
};
