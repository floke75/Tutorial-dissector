
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
  customContext: string;
  setCustomContext: (s: string) => void;
  onStart: () => void;
  disabled: boolean;
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
  customContext,
  setCustomContext,
  onStart,
  disabled
}) => {
  return (
    <div className="bg-white/70 dark:bg-gray-850/70 backdrop-blur-md p-5 rounded-2xl border border-gray-200/50 dark:border-gray-800/50 shadow-md dark:shadow-black/20">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-5 uppercase tracking-wider">Analysis Settings</h3>
      
      <div className="space-y-5">
        {/* Video Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Video URL (YouTube or Gemini File URI)</label>
          <input 
            type="text" 
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=... or https://generativelanguage..."
            className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-2.5 text-gray-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600"
            disabled={disabled}
          />
        </div>
        <div>
           <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Duration (MM:SS)</label>
          <input 
            type="text" 
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            placeholder="10:00"
            className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-2.5 text-gray-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600 font-mono"
            disabled={disabled}
          />
        </div>

        {/* Sliders */}
        <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-5">
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <label className="font-medium text-gray-700 dark:text-gray-300">Chunk Size</label>
              <span className="text-blue-600 dark:text-blue-400 font-mono">{chunkSize / 60} min</span>
            </div>
            <input 
              type="range" 
              min="60" 
              max="420" 
              step="60"
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value))}
              className="w-full accent-blue-600 dark:accent-blue-500 h-2 bg-gray-200 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer"
              disabled={disabled}
            />
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1.5">Between 1 to 7 minutes</p>
          </div>

          <div>
             <div className="flex justify-between text-sm mb-1.5">
              <label className="font-medium text-gray-700 dark:text-gray-300">Overlap</label>
              <span className="text-blue-600 dark:text-blue-400 font-mono">{overlap} sec</span>
            </div>
            <input 
              type="range" 
              min="10" 
              max="90" 
              step="10"
              value={overlap}
              onChange={(e) => setOverlap(Number(e.target.value))}
              className="w-full accent-blue-600 dark:accent-blue-500 h-2 bg-gray-200 dark:bg-gray-800 rounded-lg appearance-none cursor-pointer"
              disabled={disabled}
            />
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1.5">Context window for continuity</p>
          </div>
        </div>

        {/* Custom Context */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Custom App Context</label>
          <textarea 
            value={customContext}
            onChange={(e) => setCustomContext(e.target.value)}
            placeholder="Paste documentation or context here..."
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 resize-y min-h-[100px]"
            disabled={disabled}
          />
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1.5">Provides holistic understanding to the LLM</p>
        </div>
      </div>

      <div className="mt-6">
        <button 
          onClick={onStart}
          disabled={disabled || !videoUrl || !durationInput}
          className={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
            disabled || !videoUrl || !durationInput
              ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed' 
              : 'bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 shadow-md hover:shadow-lg active:scale-[0.98]'
          }`}
        >
          {disabled ? 'Processing...' : 'Start Analysis'}
        </button>
      </div>
    </div>
  );
};
