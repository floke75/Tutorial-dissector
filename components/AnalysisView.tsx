
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { InputPanel } from './InputPanel';
import { ChunkVisualizer } from './ChunkVisualizer';
import { ResultsTimeline } from './ResultsTimeline';
import { DevConsole } from './DevConsole';
import { ThemeToggle } from './ThemeToggle';
import { ArrowLeft, LayoutPanelLeft, Activity, Clock, Loader2 } from 'lucide-react';
import { computeChunkWindows, parseMMSS, formatMMSS } from '../utils/timeUtils';
import { analyzeChunkPhaseA, accumulateChunkPhaseB, analyzeNarrationSegment } from '../services/geminiService';
import { getProject, saveProject } from '../services/storage';
import { Chunk, ProcessingState, ActionItem, NarrativeStep, PhaseBResponse, Project, LogLevel } from '../types';
import ReactPlayer from 'react-player';

interface AnalysisViewProps {
  projectId: string;
  onBack: () => void;
}

const NARRATION_CHUNK_SIZE_SEC = 300; 

export const AnalysisView: React.FC<AnalysisViewProps> = ({ projectId, onBack }) => {
  // Config State
  const [projectName, setProjectName] = useState('Untitled Project');
  const [videoUrl, setVideoUrl] = useState('');
  const [durationInput, setDurationInput] = useState('');
  const [chunkSize, setChunkSize] = useState(60); 
  const [overlap, setOverlap] = useState(30);
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
  const [showSidebar, setShowSidebar] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const playerRef = useRef<ReactPlayer>(null);

  // Timing stats for UI
  const [elapsedTime, setElapsedTime] = useState(0);
  const [apiKey, setApiKey] = useState<string>('');
  
  const stateRef = useRef(procState);
  stateRef.current = procState;
  
  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchApiKey = async () => {
      try {
        const configRes = await fetch('/api/config');
        const configData = await configRes.json();
        if (configData.apiKey && configData.apiKey !== "MY_GEMINI_API_KEY") {
          setApiKey(configData.apiKey);
        }
      } catch (e) {
        console.warn("Failed to fetch API key from server", e);
      }
    };
    fetchApiKey();
  }, []);

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
      
      // Sanitize loaded actions to ensure unique IDs
      const seenActionIds = new Set<string>();
      const sanitizedActions = (data.actions || []).map((a, idx) => {
        let id = a.id || `evt_missing_${idx}`;
        if (seenActionIds.has(id)) {
          id = `${id}_dup_${idx}`;
        }
        seenActionIds.add(id);
        return { ...a, id };
      });
      setActions(sanitizedActions);

      // Sanitize loaded narrative steps to ensure unique IDs
      const seenStepIds = new Set<string>();
      const sanitizedSteps = (data.narrativeSteps || []).map((s, idx) => {
        let id = s.id || `step_missing_${idx}`;
        if (seenStepIds.has(id)) {
          id = `${id}_dup_${idx}`;
        }
        seenStepIds.add(id);
        return { ...s, id };
      });
      setNarrativeSteps(sanitizedSteps);
      
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

  // Local chunk computation removed as it's now handled by the server

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

  const handleStart = async () => {
    if (!videoUrl) {
      alert("Please enter a YouTube URL");
      return;
    }

    if (procState.status === 'idle' || procState.status === 'completed' || procState.status === 'error' || procState.status === 'cancelled') {
       handleLog('info', 'Initializing new analysis pipeline locally...', { chunkSize, overlap });
       
       setActions([]);
       setNarrativeSteps([]);
       setChunks([]);
       setProcState(prev => ({
        status: 'running_visual',
        currentChunkIndex: 0,
        narrationStartTime: 0,
        totalActions: 0,
        totalTokens: 0,
        startTime: Date.now(),
        lastInteractionId: null,
        chatHistory: [],
        logs: prev.logs, // retain logs on restart
        jobId: 'local-job'
      }));

      // Get API key from state or server
      let currentApiKey = apiKey;
      
      if (!currentApiKey || currentApiKey === "undefined" || currentApiKey === "MY_GEMINI_API_KEY") {
        // @ts-ignore
        currentApiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || '';
      }

      if (!currentApiKey || currentApiKey === "undefined" || currentApiKey === "MY_GEMINI_API_KEY") {
        try {
          const configRes = await fetch('/api/config');
          const configData = await configRes.json();
          currentApiKey = configData.apiKey;
          if (currentApiKey && currentApiKey !== "MY_GEMINI_API_KEY") setApiKey(currentApiKey);
        } catch (e) {
          console.warn("Failed to fetch API key from server", e);
        }
      }

      if (!currentApiKey || currentApiKey === "undefined" || currentApiKey === "MY_GEMINI_API_KEY") {
        try {
          // @ts-ignore
          if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
            // @ts-ignore
            currentApiKey = process.env.API_KEY;
          }
        } catch (e) {
          console.warn("process.env is not defined in browser");
        }
      }

      if (!currentApiKey || currentApiKey === "undefined" || currentApiKey === "MY_GEMINI_API_KEY") {
        // @ts-ignore
        if (window.aistudio && window.aistudio.hasSelectedApiKey) {
          try {
            // @ts-ignore
            const hasKey = await window.aistudio.hasSelectedApiKey();
            if (!hasKey) {
              // @ts-ignore
              await window.aistudio.openSelectKey();
            }
            
            // Try fetching again after selection or if it already has a key
            const configRes = await fetch('/api/config');
            const configData = await configRes.json();
            currentApiKey = configData.apiKey;
            if (currentApiKey && currentApiKey !== "MY_GEMINI_API_KEY") {
              setApiKey(currentApiKey);
            }
            
            // Also check process.env.API_KEY again
            if (!currentApiKey || currentApiKey === "undefined" || currentApiKey === "MY_GEMINI_API_KEY") {
              // @ts-ignore
              if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
                // @ts-ignore
                currentApiKey = process.env.API_KEY;
                setApiKey(currentApiKey);
              }
            }
          } catch (e) {
            console.warn("Failed to handle aistudio key selection", e);
          }
        }
      }

      if (!currentApiKey || currentApiKey === "undefined" || currentApiKey === "MY_GEMINI_API_KEY") {
        handleLog('error', 'API key is required. Please set GEMINI_API_KEY environment variable or select a key.');
        setProcState(prev => ({ ...prev, status: 'error' }));
        return;
      }
      
      try {
        handleLog('info', 'Fetching video metadata...', { url: videoUrl });
        let duration = 0;
        if (durationInput) {
          duration = parseMMSS(durationInput);
          if (duration <= 0) {
            throw new Error("Invalid duration format. Please use MM:SS or HH:MM:SS.");
          }
          handleLog('success', `Using provided duration: ${duration}s`);
        } else if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
          const res = await fetch('/api/metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoUrl })
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          duration = data.duration;
          handleLog('success', `Found YouTube duration: ${duration}s`);
        } else {
          throw new Error("Duration is required for non-YouTube videos. Please provide a duration.");
        }

        setProcState(prev => ({ ...prev, duration }));
        const computedChunks = computeChunkWindows(duration, chunkSize, overlap);
        setChunks(computedChunks);
        handleLog('info', `Calculated ${computedChunks.length} chunks for processing`);

        let chatHistory: any[] = [];
        let cumulativeActions: ActionItem[] = [];
        let cumulativeNarrative: NarrativeStep[] = [];
        let currentUIState: any = null;

        for (let i = 0; i < computedChunks.length; i++) {
          // Check if cancelled (we can check stateRef)
          if (stateRef.current.status === 'cancelled') {
            handleLog('warn', 'Job cancelled by user');
            return;
          }

          setProcState(prev => ({ ...prev, currentChunkIndex: i }));
          const chunk = computedChunks[i];

          handleLog('info', `--- Starting Chunk ${i + 1}/${computedChunks.length} ---`, { chunk });

          // Phase A
          handleLog('info', `Phase A: Extracting raw actions...`);
          const rawActions = await analyzeChunkPhaseA(
            videoUrl,
            chunk.clipStart,
            chunk.clipEnd,
            chunk.primaryStart,
            chunk.primaryEnd,
            overlap,
            customContext,
            currentApiKey,
            handleLog
          );

          // Phase B
          handleLog('info', `Phase B: Validating and merging state...`);
          const primaryWindowStr = `${chunk.primaryStart}s-${chunk.primaryEnd}s`;
          const phaseBResult = await accumulateChunkPhaseB(
            videoUrl,
            `${duration}s`,
            rawActions,
            i + 1,
            primaryWindowStr,
            chatHistory,
            customContext,
            currentApiKey,
            handleLog
          );

          chatHistory = phaseBResult.newHistory;
          currentUIState = phaseBResult.result.current_ui_state;
          setLatestUIState(currentUIState);
          
          const uniqueEvents: ActionItem[] = [];
          phaseBResult.result.validated_segment_events.forEach((evt, idx) => {
            const isDuplicate = cumulativeActions.some(a => 
              a.timestamp === evt.timestamp && a.action_type === evt.action_type
            );
            if (!isDuplicate) {
              uniqueEvents.push({
                ...evt,
                id: `${evt.id}_c${i}_${idx}`
              });
            }
          });

          cumulativeActions = [...cumulativeActions, ...uniqueEvents];
          setActions(cumulativeActions);
          setProcState(prev => ({ ...prev, totalActions: cumulativeActions.length }));

          // Phase C
          handleLog('info', `Phase C: Synthesizing narrative steps...`);
          const newNarrativeSteps = await analyzeNarrationSegment(
            videoUrl,
            chunk.clipStart,
            chunk.clipEnd,
            uniqueEvents,
            customContext,
            currentApiKey,
            handleLog
          );

          const uniqueNarrativeSteps = newNarrativeSteps.map((step, idx) => ({
            ...step,
            id: `${step.id}_c${i}_${idx}`
          }));

          cumulativeNarrative = [...cumulativeNarrative, ...uniqueNarrativeSteps];
          setNarrativeSteps(cumulativeNarrative);

          handleLog('success', `Chunk ${i + 1} completed successfully.`);
        }

        setProcState(prev => ({ ...prev, status: 'completed' }));
        handleLog('success', 'Workflow analysis completed successfully!');

      } catch (err: any) {
        console.error("Job failed:", err);
        handleLog('error', `Fatal error: ${err.message || 'Unknown error occurred'}`);
        setProcState(prev => ({ ...prev, status: 'error' }));
      }
    }
  };

  // --------------------------------------------------------------------------------
  // SERVER POLLING LOOP (REMOVED)
  // --------------------------------------------------------------------------------
  // The polling loop has been removed because the job now runs locally.

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return `${h > 0 ? h + ':' : ''}${m % 60}:${(s % 60).toString().padStart(2, '0')}`;
  };

  const isVisualRunning = procState.status === 'running_visual';
  const isNarrationRunning = procState.status === 'running_narration';

  // Auto-hide sidebar when completed
  useEffect(() => {
    if (procState.status === 'completed') {
      setShowSidebar(false);
    }
  }, [procState.status]);

  useEffect(() => {
    if (showSidebar) {
      setIsPlayerReady(false);
    }
  }, [showSidebar]);

  useEffect(() => {
    setIsPlayerReady(false);
  }, [videoUrl]);

  const handleSeek = (timeSec: number) => {
    console.log("handleSeek called with timeSec:", timeSec, "isPlayerReady:", isPlayerReady);
    if (playerRef.current) {
      try {
        playerRef.current.seekTo(timeSec, 'seconds');
        setIsPlaying(true);
      } catch (e) {
        console.error("Seek error:", e);
      }
    }
  };

  const getPlayableVideoUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('generativelanguage.googleapis.com')) {
      let currentApiKey = apiKey;
      if (!currentApiKey || currentApiKey === "undefined" || currentApiKey === "MY_GEMINI_API_KEY") {
        // @ts-ignore
        currentApiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || '';
      }
      if (!currentApiKey || currentApiKey === "undefined" || currentApiKey === "MY_GEMINI_API_KEY") {
        try {
          // @ts-ignore
          if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
            // @ts-ignore
            currentApiKey = process.env.GEMINI_API_KEY;
          }
        } catch (e) {}
      }
      if (!currentApiKey || currentApiKey === "undefined" || currentApiKey === "MY_GEMINI_API_KEY") {
        try {
          // @ts-ignore
          if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
            // @ts-ignore
            currentApiKey = process.env.API_KEY;
          }
        } catch (e) {}
      }
      if (currentApiKey === "MY_GEMINI_API_KEY") {
        currentApiKey = "";
      }
      
      if (currentApiKey && currentApiKey !== "undefined") {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}alt=media&key=${currentApiKey}`;
      }
    }
    // Normalize youtu.be links to standard youtube.com watch links for better iframe compatibility
    if (url.includes('youtu.be/')) {
      const videoId = url.split('youtu.be/')[1].split('?')[0];
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    // Normalize youtube.com/shorts/ links
    if (url.includes('youtube.com/shorts/')) {
      const videoId = url.split('youtube.com/shorts/')[1].split('?')[0];
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    return url;
  };

  const playableUrl = getPlayableVideoUrl(videoUrl);
  const isGeminiFile = videoUrl.includes('generativelanguage.googleapis.com');

  const activeNarrativeStep = useMemo(() => {
    if (!narrativeSteps.length) return null;
    let active = null;
    let latestTime = -1;
    for (const step of narrativeSteps) {
      const time = parseMMSS(step.timestamp);
      if (time <= currentTime && time >= latestTime) {
        active = step;
        latestTime = time;
      }
    }
    return active;
  }, [narrativeSteps, currentTime]);

  return (
    <div className="flex flex-col h-full overflow-hidden relative bg-transparent">
      {/* Top Navigation Bar */}
      <div className="shrink-0 h-10 px-4 border-b border-gray-200/50 dark:border-gray-800/50 bg-white/60 dark:bg-gray-900/60 backdrop-blur-md flex items-center justify-between z-20 shadow-sm dark:shadow-black/10">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-1.5 transition-colors font-medium"
          >
            <ArrowLeft size={16} /> Dashboard
          </button>
          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700"></div>
          <input 
            type="text" 
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Untitled Project"
            className="bg-transparent border-none text-sm font-semibold text-gray-900 dark:text-white focus:outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600 w-64"
          />
          <span className="text-[9px] text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 font-medium uppercase tracking-wider">
            Autosave
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={`px-2 py-1 rounded-md flex items-center gap-1.5 text-[11px] font-medium transition-colors ${showSidebar ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          >
            <LayoutPanelLeft size={14} />
            {showSidebar ? 'Hide Settings' : 'Show Settings'}
          </button>
          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700"></div>
          <ThemeToggle />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex">
        {/* Sidebar */}
        {showSidebar ? (
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
                         {formatMMSS(procState.narrationStartTime)} / {procState.duration ? formatMMSS(procState.duration) : durationInput}
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
        ) : (
          <div className="w-80 lg:w-[32rem] shrink-0 border-r border-gray-200/50 dark:border-gray-800/50 bg-transparent flex flex-col z-10 relative p-4 gap-4">
            <div className="w-full aspect-video bg-black relative flex items-center justify-center shrink-0 rounded-2xl overflow-hidden shadow-xl dark:shadow-black/40 border border-gray-200/50 dark:border-gray-750/50">
              {videoUrl ? (
                <ReactPlayer
                  ref={playerRef}
                  url={playableUrl}
                  width="100%"
                  height="100%"
                  style={{ position: 'absolute', top: 0, left: 0 }}
                  controls
                  playing={isPlaying}
                  onReady={() => {
                    console.log("[ReactPlayer] Player is ready. URL:", playableUrl);
                    setIsPlayerReady(true);
                  }}
                  onStart={() => {
                    console.log("[ReactPlayer] Playback started");
                    setIsPlaying(true);
                  }}
                  onPlay={() => {
                    console.log("[ReactPlayer] Playing");
                    setIsPlaying(true);
                  }}
                  onPause={() => {
                    console.log("[ReactPlayer] Paused");
                    setIsPlaying(false);
                  }}
                  onError={(e) => console.error("[ReactPlayer] Error occurred:", e)}
                  config={isGeminiFile ? { file: { forceVideo: true } } : {}}
                  onProgress={(state) => setCurrentTime(state.playedSeconds)}
                />
              ) : (
                <div className="text-gray-500 text-sm">No video URL provided</div>
              )}
            </div>
            
            {/* Active Narrative Block */}
            <div className="flex-1 overflow-y-auto p-6 bg-white/50 dark:bg-gray-850/50 bg-gradient-to-br from-indigo-500/10 via-transparent to-sky-400/10 dark:from-indigo-500/10 dark:via-transparent dark:to-sky-400/10 backdrop-blur-md rounded-2xl border border-gray-200/50 dark:border-gray-750/50 shadow-xl dark:shadow-black/40 custom-scrollbar">
              {activeNarrativeStep ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-indigo-100 tracking-tight">{activeNarrativeStep.intent}</h3>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold uppercase tracking-wider border border-indigo-200 dark:border-indigo-700/50 animate-pulse">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 dark:bg-indigo-400"></div>
                      Current
                    </span>
                  </div>
                  
                  {/* Pre/Post Conditions */}
                  <div className="grid grid-cols-1 gap-3">
                    {activeNarrativeStep.precondition && (
                      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-750">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-blue-500"></div> Precondition (Given)
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">{activeNarrativeStep.precondition}</p>
                      </div>
                    )}
                    {activeNarrativeStep.postcondition && (
                      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-750">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Postcondition (Then)
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">{activeNarrativeStep.postcondition}</p>
                      </div>
                    )}
                  </div>

                  <p className="text-gray-600 dark:text-gray-400 italic font-serif leading-relaxed text-sm border-l-2 border-indigo-200 dark:border-indigo-900/50 pl-4 py-1">
                    "{activeNarrativeStep.explanation}"
                  </p>
                  
                  {activeNarrativeStep.topics && activeNarrativeStep.topics.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {activeNarrativeStep.topics.map((t, i) => (
                        <span key={i} className="px-2 py-1 bg-indigo-50 dark:bg-gray-900/50 text-indigo-700 dark:text-indigo-300/70 text-[10px] font-medium rounded-md border border-indigo-100 dark:border-indigo-900/50">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-600 text-sm font-medium">
                  No active narrative step
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timeline & Visualizer Area */}
        <div className="flex-1 min-w-0 flex flex-col p-4 gap-4 overflow-hidden">
          <div className="flex-1 min-h-0">
            <ResultsTimeline 
              actions={actions} 
              narrativeSteps={narrativeSteps} 
              currentTime={currentTime}
              onSeek={handleSeek}
            />
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
