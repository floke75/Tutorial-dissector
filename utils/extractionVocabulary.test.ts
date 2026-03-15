import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateExtractionVocabulary } from './extractionVocabulary.ts';
import fs from 'fs';

describe('generateExtractionVocabulary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns formatted vocabulary string when glossary exists and software matches', () => {
    const mockGlossary = {
      "Cuez": {
        "buttons": {
          "create_template": { "canonical": "Create block template", "aliases": ["new template"] },
          "manage_templates": { "canonical": "Manage block templates", "aliases": ["template settings"] }
        },
        "panels": {
          "episode_menu": { "canonical": "Episode Action Menu", "aliases": ["episode dropdown"] }
        },
        "_meta": { "version": 1, "updated": "2026-03-14" }
      }
    };

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockGlossary));

    const result = generateExtractionVocabulary('dummy.json', 'Cuez');

    expect(result).toContain('KNOWN UI ELEMENTS FOR CUEZ:');
    expect(result).toContain('- Create block template');
    expect(result).toContain('- Manage block templates');
    expect(result).toContain('- Episode Action Menu');
    expect(result).not.toContain('_meta');
  });

  it('returns empty string when file does not exist', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = generateExtractionVocabulary('nonexistent.json', 'Cuez');

    expect(result).toBe('');
  });

  it('returns empty string when software key is missing', () => {
    const mockGlossary = {
      "OtherSoftware": {
        "buttons": {
          "btn": { "canonical": "Button" }
        }
      }
    };

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockGlossary));

    const result = generateExtractionVocabulary('dummy.json', 'Cuez');

    expect(result).toBe('');
  });

  it('returns empty string when JSON is malformed', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{ invalid json ');

    const result = generateExtractionVocabulary('dummy.json', 'Cuez');

    expect(result).toBe('');
  });
});
