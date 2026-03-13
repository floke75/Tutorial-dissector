
import React from 'react';
import { Chunk } from '../types';
import { formatMMSS } from '../utils/timeUtils';

interface ChunkVisualizerProps {
  chunks: Chunk[];
  narrationChunkIndex?: number;
  narrationChunkCount?: number;
  isNarrating?: boolean;
}

export const ChunkVisualizer: React.FC<ChunkVisualizerProps> = ({ chunks, narrationChunkIndex, narrationChunkCount, isNarrating }) => {
  if (chunks.length === 0) return null;

  return (
    <div className="bg-white/70 dark:bg-gray-850/70 backdrop-blur-md p-6 rounded-2xl border border-gray-200/50 dark:border-gray-800/50 shadow-lg dark:shadow-black/30 mt-6 overflow-x-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Visual Analysis Plan</h3>
        <div className="flex gap-4 text-[10px] text-gray-500 dark:text-gray-500 font-medium">
           <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Visual Raw</span>
           <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Visual Merge</span>
           <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Narration</span>
        </div>
      </div>
      
      <div className="flex gap-2 min-w-max pb-2">
        {chunks.map((chunk) => {
          let colorClass = 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-500';
          if (chunk.status === 'analyzing_phase_a') colorClass = 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-500 text-blue-600 dark:text-blue-300 animate-pulse';
          if (chunk.status === 'analyzing_phase_b') colorClass = 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-500 text-purple-600 dark:text-purple-300 animate-pulse';
          if (chunk.status === 'completed') colorClass = 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-600 text-emerald-600 dark:text-emerald-400';
          if (chunk.status === 'error') colorClass = 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-600 text-red-600 dark:text-red-400';

          return (
            <div 
              key={chunk.index} 
              className={`flex flex-col items-center justify-center p-3 rounded-xl border w-36 shrink-0 transition-all relative group shadow-sm ${colorClass}`}
            >
              <span className="text-xs font-mono font-bold">CHUNK {chunk.index + 1}</span>
              <span className="text-xs mt-1">{formatMMSS(chunk.primaryStart)} - {formatMMSS(chunk.primaryEnd)}</span>
              
              <span className="text-[10px] mt-2 opacity-75 font-bold uppercase">
                {chunk.status === 'pending' && 'WAITING'}
                {chunk.status === 'analyzing_phase_a' && 'SCANNING...'}
                {chunk.status === 'analyzing_phase_b' && 'MERGING...'}
                {chunk.status === 'completed' && 'COMPLETED'}
                {chunk.status === 'error' && 'FAILED'}
              </span>

              {/* Counts */}
              {chunk.status === 'completed' && (
                <div className="flex gap-2 mt-2 w-full justify-center border-t border-black/5 dark:border-white/10 pt-1.5">
                   <div className="text-[10px] text-blue-600 dark:text-blue-300 font-medium" title="Visual actions">
                      V: {chunk.phaseBAddedCount ?? '-'}
                   </div>
                </div>
              )}
              
              {/* Interaction ID Tooltip */}
              {chunk.interactionId && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-black text-white text-[10px] px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10 pointer-events-none shadow-md">
                  ID: {chunk.interactionId.substring(0, 8)}...
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isNarrating && narrationChunkCount != null && narrationChunkCount > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-300 font-medium">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
          <span>Narrating segment {Math.min((narrationChunkIndex ?? 0) + 1, narrationChunkCount)} of {narrationChunkCount}...</span>
        </div>
      )}
    </div>
  );
};
