import React from 'react';
import { ChunkWindow } from '../types';
import { formatMMSS } from '../utils/timeUtils';

interface ChunkVisualizerProps {
  chunks: ChunkWindow[];
}

export const ChunkVisualizer: React.FC<ChunkVisualizerProps> = ({ chunks }) => {
  if (chunks.length === 0) return null;

  return (
    <div className="bg-gray-850 p-6 rounded-xl border border-gray-750 shadow-lg mt-6 overflow-x-auto">
      <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider">Analysis Plan</h3>
      <div className="flex gap-2 min-w-max pb-2">
        {chunks.map((chunk) => {
          let colorClass = 'bg-gray-800 border-gray-700 text-gray-500';
          if (chunk.status === 'analyzing_phase_a') colorClass = 'bg-blue-900/30 border-blue-500 text-blue-300 animate-pulse';
          if (chunk.status === 'analyzing_phase_b') colorClass = 'bg-purple-900/30 border-purple-500 text-purple-300 animate-pulse';
          if (chunk.status === 'completed') colorClass = 'bg-green-900/30 border-green-600 text-green-400';
          if (chunk.status === 'error') colorClass = 'bg-red-900/30 border-red-600 text-red-400';

          return (
            <div 
              key={chunk.index} 
              className={`flex flex-col items-center justify-center p-3 rounded-lg border w-32 shrink-0 transition-all ${colorClass}`}
            >
              <span className="text-xs font-mono font-bold">CHUNK {chunk.index + 1}</span>
              <span className="text-xs mt-1">{formatMMSS(chunk.primaryStart)} - {formatMMSS(chunk.primaryEnd)}</span>
              <span className="text-[10px] mt-2 opacity-75">
                {chunk.status === 'pending' && 'WAITING'}
                {chunk.status === 'analyzing_phase_a' && 'VIDEO SCAN'}
                {chunk.status === 'analyzing_phase_b' && 'MERGING'}
                {chunk.status === 'completed' && 'DONE'}
                {chunk.status === 'error' && 'FAILED'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
