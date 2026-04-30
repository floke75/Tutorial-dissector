import { describe, it, expect } from 'vitest';
import { computeChunkWindows, parseMMSS, formatMMSS } from './timeUtils';

describe('Time Utilities', () => {
  describe('parseMMSS', () => {
    it('should parse MM:SS correctly', () => {
      expect(parseMMSS('01:30')).toBe(90);
      expect(parseMMSS('00:45')).toBe(45);
      expect(parseMMSS('10:00')).toBe(600);
    });

    it('should parse HH:MM:SS correctly', () => {
      expect(parseMMSS('01:01:30')).toBe(3690);
    });

    it('should parse single numbers as seconds', () => {
      expect(parseMMSS('45')).toBe(45);
    });
  });

  describe('formatMMSS', () => {
    it('should format seconds to MM:SS', () => {
      expect(formatMMSS(90)).toBe('01:30');
      expect(formatMMSS(45)).toBe('00:45');
      expect(formatMMSS(600)).toBe('10:00');
      expect(formatMMSS(0)).toBe('00:00');
    });
  });

  describe('computeChunkWindows', () => {
    it('should correctly map the token window to frontend blocks', () => {
      // 100 seconds video, 60 seconds chunk size, 10 seconds overlap
      const chunks = computeChunkWindows(100, 60, 10);
      
      expect(chunks).toHaveLength(2);
      
      // First chunk
      expect(chunks[0].index).toBe(0);
      expect(chunks[0].primaryStart).toBe(0);
      expect(chunks[0].primaryEnd).toBe(60);
      expect(chunks[0].clipStart).toBe(0); // Can't go below 0
      expect(chunks[0].clipEnd).toBe(70); // 60 + 10 overlap
      
      // Second chunk
      expect(chunks[1].index).toBe(1);
      expect(chunks[1].primaryStart).toBe(60);
      expect(chunks[1].primaryEnd).toBe(100);
      expect(chunks[1].clipStart).toBe(50); // 60 - 10 overlap
      expect(chunks[1].clipEnd).toBe(100); // Can't go above total duration
    });

    it('should handle exact multiples of chunk size', () => {
      const chunks = computeChunkWindows(120, 60, 5);
      
      expect(chunks).toHaveLength(2);
      
      expect(chunks[0].primaryStart).toBe(0);
      expect(chunks[0].primaryEnd).toBe(60);
      expect(chunks[0].clipStart).toBe(0);
      expect(chunks[0].clipEnd).toBe(65);
      
      expect(chunks[1].primaryStart).toBe(60);
      expect(chunks[1].primaryEnd).toBe(120);
      expect(chunks[1].clipStart).toBe(55);
      expect(chunks[1].clipEnd).toBe(120);
    });

    it('should fold short tail chunks into the preceding chunk', () => {
      // 190s / 60s = chunks at 0-60, 60-120, 120-180, 180-190
      // Last chunk is 10s = 16.7% of 60 → folds into chunk 2
      const chunks = computeChunkWindows(190, 60, 10);
      expect(chunks).toHaveLength(3);
      const last = chunks[chunks.length - 1];
      expect(last.primaryStart).toBe(120);
      expect(last.primaryEnd).toBe(190);
      expect(last.clipStart).toBe(110); // unchanged from original chunk 2
      expect(last.clipEnd).toBe(190);
    });

    it('should keep tail chunks at 50% or more of chunk size', () => {
      // 210s / 60s = chunks at 0-60, 60-120, 120-180, 180-210
      // Last chunk is 30s = exactly 50% → NOT folded (strict <)
      const chunks = computeChunkWindows(210, 60, 10);
      expect(chunks).toHaveLength(4);
      expect(chunks[3].primaryStart).toBe(180);
      expect(chunks[3].primaryEnd).toBe(210);
      expect(chunks[3].clipStart).toBe(170); // 180 - 10 overlap
      expect(chunks[3].clipEnd).toBe(210);   // capped at duration
    });

    it('should not fold when there is only one chunk', () => {
      const chunks = computeChunkWindows(20, 60, 10);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].primaryEnd).toBe(20);
    });
  });
});
