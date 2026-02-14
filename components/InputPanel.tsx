import React from 'react';

interface InputPanelProps {
  videoUrl: string;
  setVideoUrl: (s: string) => void;
  durationInput: string;
  setDurationInput: (s: string) => void;
  chunkSize: number;
  setChunkSize: (n: number) => void;
  overlap: number;
  setOverlap: (n: number) => void;
  onStart: () => void;
  disabled: boolean;
  hasSavedSession: boolean;
  onResumeSession: () => void;
  onSaveSession: () => void;
  lastSavedTime: string | null;
}

export const InputPanel: React.FC<InputPanelProps> = ({
  videoUrl,
  setVideoUrl,
  durationInput,
  setDurationInput,
  chunkSize,
  setChunkSize,
  overlap,
  setOverlap,
  onStart,
  disabled,
  hasSavedSession,
  onResumeSession,
  onSaveSession,
  lastSavedTime
}) => {
  return (
    <div className="bg-gray-850 p-6 rounded-xl border border-gray-750 shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-blue-400">Configuration</h2>
        <div className="flex gap-2">
            {hasSavedSession && !disabled && (
                <button 
                  onClick={onResumeSession}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded transition border border-gray-600"
                >
                  Resume Session
                </button>
            )}
             <button 
                  onClick={onSaveSession}
                  disabled={!videoUrl}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded transition border border-gray-600 disabled:opacity-50"
                  title={lastSavedTime ? `Last saved: ${lastSavedTime}` : "Save current progress"}
                >
                  Save
             </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Video Input */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">YouTube URL</label>
            <input 
              type="text" 
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-white focus:border-blue-500 focus:outline-none"
              disabled={disabled}
            />
          </div>
          <div>
             <label className="block text-sm text-gray-400 mb-1">Duration (MM:SS)</label>
            <input 
              type="text" 
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value)}
              placeholder="10:00"
              className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-white focus:border-blue-500 focus:outline-none"
              disabled={disabled}
            />
          </div>
        </div>

        {/* Sliders */}
        <div className="space-y-6">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <label className="text-gray-400">Chunk Size</label>
              <span className="text-blue-300">{chunkSize / 60} minutes</span>
            </div>
            <input 
              type="range" 
              min="180" 
              max="420" 
              step="60"
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value))}
              className="w-full accent-blue-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              disabled={disabled}
            />
            <p className="text-xs text-gray-500 mt-1">Between 3 to 7 minutes</p>
          </div>

          <div>
             <div className="flex justify-between text-sm mb-1">
              <label className="text-gray-400">Overlap</label>
              <span className="text-blue-300">{overlap} seconds</span>
            </div>
            <input 
              type="range" 
              min="30" 
              max="90" 
              step="10"
              value={overlap}
              onChange={(e) => setOverlap(Number(e.target.value))}
              className="w-full accent-blue-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              disabled={disabled}
            />
            <p className="text-xs text-gray-500 mt-1">Context window for continuity</p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-between items-center">
         <span className="text-xs text-gray-500">
            {lastSavedTime && `Last saved: ${lastSavedTime}`}
         </span>
        <button 
          onClick={onStart}
          disabled={disabled || !videoUrl || !durationInput}
          className={`px-8 py-3 rounded-lg font-bold text-white transition-colors ${
            disabled || !videoUrl || !durationInput
              ? 'bg-gray-700 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/50'
          }`}
        >
          {disabled ? 'Processing...' : 'Start Analysis'}
        </button>
      </div>
    </div>
  );
};