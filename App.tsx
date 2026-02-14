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
      const currentChunks = chunksRef.current;

      if (status !== 'running' || !active) return;
      if (currentChunkIndex >= currentChunks.length) {
        setProcState(s => ({ ...s, status: 'completed' }));
        return;
      }

      const chunk = currentChunks[currentChunkIndex];

      try {
        // Update Status: Phase A
        setChunks(prev => prev.map((c, i) => i === currentChunkIndex ? { ...c, status: 'analyzing_phase_a' } : c));

        // Execute Phase A
        const phaseAActions = await analyzeChunkPhaseA(
          videoUrl,
          chunk.clipStart,
          chunk.clipEnd,
          chunk.primaryStart,
          chunk.primaryEnd,
          overlap
        );

        if (!active) return;

        // Update Status: Phase B
        setChunks(prev => prev.map((c, i) => i === currentChunkIndex ? { ...c, status: 'analyzing_phase_b' } : c));

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

        if (!active) return;

        // Update State
        setLatestUIState(result.current_ui_state);
        
        // Append new actions
        const newActions = result.validated_segment_events || phaseAActions; // Fallback if model fails to return validated list
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
           actions: [...actions, ...newActions],
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
        console.error(err);
        setChunks(prev => prev.map((c, i) => i === currentChunkIndex ? { ...c, status: 'error', errorMsg: String(err) } : c));
        setProcState(prev => ({ ...prev, status: 'paused' })); // Pause on error
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
    return `${h > 0 ? h + 'h ' : ''}${m % 60}m ${s % 60}s`;
  };

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 font-sans">
      {/* Left Sidebar: Controls & Progress */}
      <div className="w-[450px] flex flex-col border-r border-gray-800 bg-gray-900 overflow-y-auto">
        <div className="p-6 pb-0">
          <h1 className="text-2xl font-bold tracking-tight mb-2 text-white">Tutorial Dissector <span className="text-blue-500 text-sm align-top">PRO</span></h1>
          <p className="text-gray-400 text-sm mb-6">AI-powered semantic extraction for software tutorials.</p>
        </div>

        <div className="px-6 pb-6 space-y-6">
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
          
          {procState.status !== 'idle' && (
             <div className="bg-gray-850 p-4 rounded-xl border border-gray-750">
                <div className="flex justify-between items-center mb-2">
                   <h3 className="font-semibold text-white">Progress</h3>
                   <div className="flex gap-2">
                      <span className={`text-[10px] px-2 py-1 rounded font-bold ${procState.status === 'running' ? 'bg-green-900 text-green-300 animate-pulse' : 'bg-yellow-900 text-yellow-300'}`}>
                         {procState.status.toUpperCase()}
                      </span>
                      <button onClick={handlePause} className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded">
                        {procState.status === 'running' ? 'Pause' : 'Resume'}
                      </button>
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                   <div>
                     <p className="text-gray-500">Actions Extracted</p>
                     <p className="text-xl font-mono text-blue-400">{procState.totalActions}</p>
                   </div>
                   <div>
                     <p className="text-gray-500">Chunks</p>
                     <p className="text-xl font-mono text-white">{procState.currentChunkIndex} / {chunks.length}</p>
                   </div>
                   <div>
                     <p className="text-gray-500">Est. Tokens</p>
                     <p className="text-lg font-mono text-gray-400">{(procState.totalTokens / 1000).toFixed(1)}k</p>
                   </div>
                    <div>
                     <p className="text-gray-500">Interaction ID</p>
                     <p className="text-xs font-mono text-gray-400 truncate" title={procState.lastInteractionId || ''}>
                         {procState.lastInteractionId ? procState.lastInteractionId.slice(-8) : '...'}
                     </p>
                   </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-700 grid grid-cols-2 gap-4 text-xs">
                    <div>
                        <p className="text-gray-500">Elapsed</p>
                        <p className="text-gray-300 font-mono">{formatTime(elapsedTime)}</p>
                    </div>
                    <div>
                        <p className="text-gray-500">Est. Remaining</p>
                        <p className="text-gray-300 font-mono">{estimatedRemaining > 0 ? formatTime(estimatedRemaining) : '--'}</p>
                    </div>
                </div>
             </div>
          )}

          <ChunkVisualizer chunks={chunks} />

          {latestUIState && (
            <div className="bg-gray-850 p-4 rounded-xl border border-gray-750 text-xs">
              <h3 className="font-semibold text-gray-300 mb-2 border-b border-gray-700 pb-1">Current Context Memory</h3>
              <div className="space-y-2">
                <div><span className="text-gray-500">App:</span> <span className="text-white">{latestUIState.application}</span></div>
                <div><span className="text-gray-500">File:</span> <span className="text-white">{latestUIState.active_file || 'None'}</span></div>
                <div><span className="text-gray-500">Panels:</span> <span className="text-gray-300">{latestUIState.visible_panels.join(', ')}</span></div>
                <div><span className="text-gray-500">Dialogs:</span> <span className="text-gray-300">{latestUIState.open_dialogs.join(', ') || 'None'}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content: Results */}
      <div className="flex-1 bg-gray-950 p-6 h-full overflow-hidden">
        <ResultsTimeline actions={actions} />
      </div>
    </div>
  );
}

export default App;