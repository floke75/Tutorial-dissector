import React, { useState, useEffect, useRef } from 'react';
import { InputPanel } from './components/InputPanel';
import { ChunkVisualizer } from './components/ChunkVisualizer';
import { ResultsTimeline } from './components/ResultsTimeline';
import { computeChunkWindows, parseMMSS } from './utils/timeUtils';
import { analyzeChunkPhaseA, accumulateChunkPhaseB } from './services/geminiService';
import { ChunkWindow, ProcessingState, ActionItem, PhaseBResponse } from './types';

const SESSION_KEY = 'tutorial_dissector_session_v1';

function App() {
  // Config State
  const [videoUrl, setVideoUrl] = useState('');
  const [durationInput, setDurationInput] = useState('');
  const [chunkSize, setChunkSize] = useState(300); // 5 mins
  const [overlap, setOverlap] = useState(60);

  // Runtime State
  const [chunks, setChunks] = useState<ChunkWindow[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [procState, setProcState] = useState<ProcessingState>({
    status: 'idle',
    currentChunkIndex: 0,
    totalActions: 0,
    totalTokens: 0,
    startTime: null,
    lastInteractionId: null
  });

  // UI State
  const [latestUIState, setLatestUIState] = useState<PhaseBResponse['current_ui_state'] | null>(null);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Timing stats for UI
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedRemaining, setEstimatedRemaining] = useState(0);

  // Refs for loop control to avoid closure staleness
  const stateRef = useRef(procState);
  stateRef.current = procState;
  
  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;

  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check storage on mount
  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) {
      setHasSavedSession(true);
      try {
          const data = JSON.parse(saved);
          setLastSavedTime(new Date(data.savedAt).toLocaleTimeString());
      } catch (e) { console.error(e); }
    }
  }, []);

  // Plan Calculation
  useEffect(() => {
    if (durationInput && parseMMSS(durationInput) > 0 && procState.status === 'idle') {
      const duration = parseMMSS(durationInput);
      setChunks(computeChunkWindows(duration, chunkSize, overlap));
    }
  }, [durationInput, chunkSize, overlap, procState.status]);

  // Timer Effect
  useEffect(() => {
    if (procState.status === 'running') {
      timerRef.current = setInterval(() => {
        if (stateRef.current.startTime) {
          const elapsed = Date.now() - stateRef.current.startTime;
          setElapsedTime(elapsed);
          
          // Estimate remaining
          const completed = stateRef.current.currentChunkIndex;
          if (completed > 0) {
            const avgTime = elapsed / completed;
            const remaining = chunksRef.current.length - completed;
            setEstimatedRemaining(avgTime * remaining);
          }
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [procState.status]);

  const handleStart = () => {
    console.log("Starting Analysis...");
    
    // Input validation
    const duration = parseMMSS(durationInput);
    if (duration <= 0) {
      alert("Please enter a valid duration (MM:SS)");
      return;
    }
    if (!videoUrl) {
      alert("Please enter a YouTube URL");
      return;
    }

    // Prepare Chunks
    // We calculate explicitly here to ensure they exist before state transition
    const newChunks = computeChunkWindows(duration, chunkSize, overlap);
    console.log("Calculated chunks:", newChunks.length);
    
    if (newChunks.length === 0) {
      alert("Duration is too short for the selected chunk size.");
      return;
    }

    setChunks(newChunks);
    chunksRef.current = newChunks; 

    setActions([]);
    setProcState({
      status: 'running',
      currentChunkIndex: 0,
      totalActions: 0,
      totalTokens: 0,
      startTime: Date.now(),
      lastInteractionId: null
    });
  };

  const handlePause = () => {
    setProcState(prev => ({ ...prev, status: prev.status === 'running' ? 'paused' : 'running' }));
  };

  const saveSession = () => {
    const data = {
      videoUrl,
      durationInput,
      chunkSize,
      overlap,
      chunks,
      actions,
      procState: { ...procState, status: 'paused' }, // Always save as paused
      latestUIState,
      savedAt: Date.now()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    setHasSavedSession(true);
    setLastSavedTime(new Date().toLocaleTimeString());
  };

  const restoreSession = () => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setVideoUrl(data.videoUrl);
        setDurationInput(data.durationInput);
        setChunkSize(data.chunkSize);
        setOverlap(data.overlap);
        setChunks(data.chunks);
        setActions(data.actions);
        setProcState({ ...data.procState, status: 'paused' }); // Restore as paused
        setLatestUIState(data.latestUIState);
        setLastSavedTime(new Date(data.savedAt).toLocaleTimeString());
      } catch (e) {
        console.error("Failed to restore session", e);
        alert("Corrupted session data.");
      }
    }
  };

  // Main Processing Loop
  useEffect(() => {
    let active = true;

    const processNext = async () => {
      const { status, currentChunkIndex, lastInteractionId } = stateRef.current;
      // Safety: get chunks from ref, if empty try state, if still empty, stop.
      const currentChunks = chunksRef.current.length > 0 ? chunksRef.current : chunks;

      if (status !== 'running' || !active) return;
      
      console.log(`Processing Chunk ${currentChunkIndex + 1} / ${currentChunks.length}`);

      if (currentChunks.length === 0) {
        console.warn("No chunks to process. Stopping.");
        setProcState(s => ({ ...s, status: 'idle' }));
        return;
      }

      if (currentChunkIndex >= currentChunks.length) {
        console.log("All chunks completed.");
        setProcState(s => ({ ...s, status: 'completed' }));
        return;
      }

      const chunk = currentChunks[currentChunkIndex];

      try {
        // Update Status: Phase A
        setChunks(prev => prev.map((c, i) => i === currentChunkIndex ? { ...c, status: 'analyzing_phase_a' } : c));

        console.log(`Starting Phase A (Clip: ${chunk.clipStart}s - ${chunk.clipEnd}s)...`);
        // Execute Phase A
        const phaseAActions = await analyzeChunkPhaseA(
          videoUrl,
          chunk.clipStart,
          chunk.clipEnd,
          chunk.primaryStart,
          chunk.primaryEnd,
          overlap
        );
        console.log("Phase A Complete. Actions found:", phaseAActions.length);

        if (!active) return;

        // Update Status: Phase B
        setChunks(prev => prev.map((c, i) => i === currentChunkIndex ? { ...c, status: 'analyzing_phase_b' } : c));

        console.log("Starting Phase B...");
        // Execute Phase B
        const primaryWindowStr = `${chunk.primaryStart}s-${chunk.primaryEnd}s`;
        const { interactionId, result } = await accumulateChunkPhaseB(
          videoUrl,
          durationInput,
          phaseAActions,
          currentChunkIndex + 1,
          primaryWindowStr,
          lastInteractionId
        );
        console.log("Phase B Complete.");

        if (!active) return;

        // Update State
        setLatestUIState(result.current_ui_state);
        
        // Append new actions
        const newActions = result.validated_segment_events ?? phaseAActions; // Fallback if model fails to return validated list
        setActions(prev => [...prev, ...newActions]);

        // Update Chunk Status to Completed
        setChunks(prev => prev.map((c, i) => i === currentChunkIndex ? { ...c, status: 'completed', actionCount: newActions.length } : c));

        // Advance
        setProcState(prev => ({
          ...prev,
          currentChunkIndex: prev.currentChunkIndex + 1,
          lastInteractionId: interactionId,
          totalActions: prev.totalActions + newActions.length,
          // Estimate tokens roughly based on 5min video
          totalTokens: prev.totalTokens + 87000 
        }));

        // Auto-save after each chunk
        const currentData = {
           videoUrl, durationInput, chunkSize, overlap,
           chunks: chunksRef.current.map((c, i) => i === currentChunkIndex ? { ...c, status: 'completed', actionCount: newActions.length } : c),
           actions: [...actionsRef.current, ...newActions],
           procState: { 
             ...stateRef.current, 
             currentChunkIndex: stateRef.current.currentChunkIndex + 1,
             lastInteractionId: interactionId,
             status: 'paused' // Save as paused so auto-resume doesn't trigger unexpectedly
            },
           latestUIState: result.current_ui_state,
           savedAt: Date.now()
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(currentData));
        setHasSavedSession(true);
        setLastSavedTime(new Date().toLocaleTimeString());


      } catch (err) {
        console.error("Processing Error:", err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        setChunks(prev => prev.map((c, i) => i === currentChunkIndex ? { ...c, status: 'error', errorMsg } : c));
        setProcState(prev => ({ ...prev, status: 'paused' })); // Pause on error
        alert(`Analysis paused due to error: ${errorMsg}`);
      }
    };

    if (procState.status === 'running') {
      processNext();
    }

    return () => { active = false; };
  }, [procState.status, procState.currentChunkIndex]); // Dependencies trigger next loop iteration

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return `${h > 0 ? h + ':' : ''}${m % 60}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-blue-400">Gemini Tutorial Dissector</h1>
          <p className="text-gray-400">Deep semantic analysis of software tutorials using Gemini 3 Pro</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
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
              disabled={procState.status === 'running'}
              hasSavedSession={hasSavedSession}
              onResumeSession={restoreSession}
              onSaveSession={saveSession}
              lastSavedTime={lastSavedTime}
            />
            
            {/* Stats Panel */}
            {procState.status !== 'idle' && (
               <div className="bg-gray-850 p-6 rounded-xl border border-gray-750 shadow-lg">
                 <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">Processing Stats</h3>
                 <div className="space-y-3 text-sm">
                   <div className="flex justify-between">
                     <span className="text-gray-500">Status</span>
                     <span className={`font-mono font-bold ${procState.status === 'running' ? 'text-green-400 animate-pulse' : 'text-gray-300'}`}>
                       {procState.status.toUpperCase()}
                     </span>
                   </div>
                   <div className="flex justify-between">
                     <span className="text-gray-500">Elapsed</span>
                     <span className="font-mono text-gray-200">{formatTime(elapsedTime)}</span>
                   </div>
                   <div className="flex justify-between">
                     <span className="text-gray-500">Est. Remaining</span>
                     <span className="font-mono text-gray-200">{formatTime(estimatedRemaining)}</span>
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
            
            {/* Latest UI State */}
            {latestUIState && (
               <div className="bg-gray-850 p-6 rounded-xl border border-gray-750 shadow-lg">
                 <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">Detected Context</h3>
                 <div className="space-y-2 text-xs">
                    <p><strong className="text-gray-500">App:</strong> {latestUIState.application}</p>
                    <p><strong className="text-gray-500">File:</strong> {latestUIState.active_file || 'None'}</p>
                    <p><strong className="text-gray-500">Tool:</strong> {latestUIState.active_tool || 'None'}</p>
                    <div>
                      <strong className="text-gray-500">Panels:</strong>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {latestUIState.visible_panels.map((p, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-gray-800 rounded text-gray-300">{p}</span>
                        ))}
                      </div>
                    </div>
                 </div>
               </div>
            )}
          </div>

          <div className="lg:col-span-2 flex flex-col h-[800px]">
            <ResultsTimeline actions={actions} />
          </div>
        </div>

        <ChunkVisualizer chunks={chunks} />
      </div>
    </div>
  );
}

export default App;