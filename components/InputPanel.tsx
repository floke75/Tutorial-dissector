
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
  onBack: () => void;
  projectName: string;
  setProjectName: (s: string) => void;
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
  onBack,
  projectName,
  setProjectName
}) => {
  return (
    <div className="bg-gray-850 p-6 rounded-xl border border-gray-750 shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <button 
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-white flex items-center gap-1 transition"
        >
          ← Dashboard
        </button>
        <span className="text-xs text-gray-600 bg-gray-900 px-2 py-1 rounded border border-gray-800">
          Autosave Enabled
        </span>
      </div>
      
      <div className="mb-6">
        <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Project Name</label>
        <input 
          type="text" 
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Untitled Project"
          className="w-full bg-transparent border-b border-gray-700 text-xl font-bold text-white focus:border-blue-500 focus:outline-none py-1"
        />
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

      <div className="mt-8">
        <button 
          onClick={onStart}
          disabled={disabled || !videoUrl || !durationInput}
          className={`w-full py-3 rounded-lg font-bold text-white transition-colors ${
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
