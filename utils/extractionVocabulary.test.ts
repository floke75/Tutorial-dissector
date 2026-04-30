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
          "create_template": { "canonical": "Create block template", "type": "button", "aliases": ["new template"] },
          "manage_templates": { "canonical": "Manage block templates", "type": "button", "aliases": ["template settings"] }
        },
        "panels": {
          "episode_menu": { "canonical": "Episode Action Menu", "type": "dropdown", "aliases": ["episode dropdown"] }
        },
        "_meta": { "version": 1, "updated": "2026-03-14" }
      }
    };

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockGlossary));

    const result = generateExtractionVocabulary('dummy.json', 'Cuez');

    expect(result).toContain('KNOWN UI ELEMENTS FOR CUEZ:');
    expect(result).toContain('use these exact names with these types:');
    expect(result).toContain('- Create block template (Type: button)');
    expect(result).toContain('Aliases: new template');
    expect(result).toContain('- Manage block templates (Type: button)');
    expect(result).toContain('Aliases: template settings');
    expect(result).toContain('- Episode Action Menu (Type: dropdown)');
    expect(result).toContain('Aliases: episode dropdown');
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
