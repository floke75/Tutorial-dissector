
import React, { useState, useRef } from 'react';
import { Vocabulary } from '../types';
import { saveVocabulary } from '../services/storage';

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
  softwareName: string;
  setSoftwareName: (s: string) => void;
  glossaryPath: string;
  setGlossaryPath: (s: string) => void;
  vocabularies: Vocabulary[];
  setVocabularies: React.Dispatch<React.SetStateAction<Vocabulary[]>>;
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
  softwareName,
  setSoftwareName,
  glossaryPath,
  setGlossaryPath,
  vocabularies,
  setVocabularies,
  onStart,
  disabled
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const content = await file.text();
      // Basic validation
      JSON.parse(content);
      
      const newVocab = {
        name: file.name,
        softwareName: softwareName || 'Unknown Software',
        content
      };
      
      const id = await saveVocabulary(newVocab);
      const savedVocab = { ...newVocab, id, userId: 'temp', updatedAt: Date.now() };
      setVocabularies(prev => [savedVocab, ...prev]);
      setGlossaryPath(id);
    } catch (err) {
      alert("Invalid JSON file. Please upload a valid vocabulary JSON.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const isDisabled = disabled || !videoUrl || (!videoUrl.includes('youtube.com') && !videoUrl.includes('youtu.be') && !videoUrl.includes('generativelanguage.googleapis.com') && !videoUrl.endsWith('.mp4') && !videoUrl.startsWith('gs://') && !durationInput) || !softwareName;

  return (
    <div className="bg-white/70 dark:bg-gray-850/70 backdrop-blur-md p-5 rounded-2xl border border-gray-200/50 dark:border-gray-800/50 shadow-md dark:shadow-black/20">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-5 uppercase tracking-wider">Analysis Settings</h3>
      
      <div className="space-y-5">
        {/* Video Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Video URL (YouTube, Direct .mp4, gs://, or Gemini URI)</label>
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
           <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Duration (MM:SS) <span className="text-gray-400 font-normal text-xs ml-1">(Optional for YouTube)</span></label>
          <input 
            type="text" 
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            placeholder="Auto-detected for YouTube"
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

        {/* Vocabulary Feedback */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Software Name <span className="text-red-500">*</span></label>
            <input 
              type="text"
              value={softwareName}
              onChange={(e) => setSoftwareName(e.target.value)}
              placeholder="e.g., Cuez"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
              disabled={disabled}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Vocabulary Source</label>
            <div className="flex gap-2">
              <select
                value={glossaryPath}
                onChange={(e) => setGlossaryPath(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm text-gray-900 dark:text-white"
                disabled={disabled}
              >
                <option value="glossary/elements.json">Default (glossary/elements.json)</option>
                {vocabularies.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isUploading}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl transition-colors text-sm font-medium whitespace-nowrap"
              >
                {isUploading ? '...' : 'Upload'}
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".json"
                className="hidden"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <button 
          onClick={onStart}
          disabled={isDisabled}
          className={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
            isDisabled
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
