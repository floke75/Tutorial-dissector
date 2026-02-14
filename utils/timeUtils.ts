
export const parseMMSS = (input: string): number => {
  const parts = input.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
};

export const formatMMSS = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const computeChunkWindows = (
  durationSec: number, 
  chunkSizeSec: number, 
  overlapSec: number
): import('../types').Chunk[] => {
  const chunks: import('../types').Chunk[] = [];
  let index = 0;
  
  // We advance by chunkSizeSec each time
  // But each chunk is actually [start - overlap, start + chunkSize + overlap]
  // The PRIMARY window is [start, start + chunkSize]
  
  for (let t = 0; t < durationSec; t += chunkSizeSec) {
    const primaryStart = t;
    const primaryEnd = Math.min(t + chunkSizeSec, durationSec);
    
    const clipStart = Math.max(0, primaryStart - overlapSec);
    const clipEnd = Math.min(durationSec, primaryEnd + overlapSec);
    
    chunks.push({
      index,
      clipStart,
      clipEnd,
      primaryStart,
      primaryEnd,
      status: 'pending',
      // Explicitly init new spec fields to undefined for clarity
      phaseARawCount: undefined,
      phaseBAddedCount: undefined,
      interactionId: undefined,
      actionCount: 0
    });
    index++;
  }
  
  return chunks;
};
