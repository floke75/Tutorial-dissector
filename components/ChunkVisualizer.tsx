
import React from 'react';
import { Chunk } from '../types';
import { formatMMSS } from '../utils/timeUtils';

interface ChunkVisualizerProps {
  chunks: Chunk[];
}

export const ChunkVisualizer: React.FC<ChunkVisualizerProps> = ({ chunks }) => {
  if (chunks.length === 0) return null;

  return (
    <div className="bg-gray-850 p-6 rounded-xl border border-gray-750 shadow-lg mt-6 overflow-x-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Analysis Plan</h3>
        <div className="flex gap-4 text-[10px] text-gray-500">
           <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Phase A (Raw)</span>
           <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> Phase B (Merged)</span>
        </div>
      </div>
      
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
              className={`flex flex-col items-center justify-center p-3 rounded-lg border w-36 shrink-0 transition-all relative group ${colorClass}`}
            >
              <span className="text-xs font-mono font-bold">CHUNK {chunk.index + 1}</span>
              <span className="text-xs mt-1">{formatMMSS(chunk.primaryStart)} - {formatMMSS(chunk.primaryEnd)}</span>
              
              <span className="text-[10px] mt-2 opacity-75 font-bold uppercase">
                {chunk.status === 'pending' && 'WAITING'}
                {chunk.status === 'analyzing_phase_a' && 'SCANNING VIDEO...'}
                {chunk.status === 'analyzing_phase_b' && 'MERGING CONTEXT...'}
                {chunk.status === 'completed' && 'COMPLETED'}
                {chunk.status === 'error' && 'FAILED'}
              </span>

              {/* Counts */}
              {chunk.status === 'completed' && (
                <div className="flex gap-2 mt-2 w-full justify-center border-t border-white/10 pt-1">
                   <div className="text-[10px] text-blue-300" title="Raw detected actions">
                      A: {chunk.phaseARawCount ?? '-'}
                   </div>
                   <div className="text-[10px] text-green-300" title="Final merged actions">
                      B: {chunk.actionCount ?? '-'}
                   </div>
                </div>
              )}
              
              {/* Interaction ID Tooltip */}
              {chunk.interactionId && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10 pointer-events-none">
                  ID: {chunk.interactionId.substring(0, 8)}...
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
