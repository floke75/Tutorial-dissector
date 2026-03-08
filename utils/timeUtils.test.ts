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
  });
});
