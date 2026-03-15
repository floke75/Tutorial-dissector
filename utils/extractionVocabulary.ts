import fs from 'fs';

/**
 * Generates a vocabulary hint string from the canonical glossary for a given software.
 * Returns empty string if no glossary exists for that software.
 * Intended to be passed as customContext to analyzeChunkPhaseA.
 */
export function generateExtractionVocabulary(
  glossaryPath: string,
  software: string
): string {
  if (!fs.existsSync(glossaryPath)) return '';

  let elements: any;
  try {
    elements = JSON.parse(fs.readFileSync(glossaryPath, 'utf-8'));
  } catch {
    return ''; // malformed JSON — skip vocabulary rather than crashing
  }

  const softwareElements = elements[software];
  if (!softwareElements) return '';

  const names: string[] = [];
  function walk(obj: any) {
    if (obj && typeof obj === 'object') {
      if (obj.canonical && typeof obj.canonical === 'string') {
        names.push(obj.canonical);
      }
      for (const [key, value] of Object.entries(obj)) {
        if (key !== '_meta' && typeof value === 'object' && value !== null) {
          walk(value);
        }
      }
    }
  }
  walk(softwareElements);

  const uniqueNames = [...new Set(names)];
  if (uniqueNames.length === 0) return '';

  return [
    `KNOWN UI ELEMENTS FOR ${software.toUpperCase()}:`,
    `The following element names have been verified in previous extractions. When you see these elements on screen, use these exact names in target.element:`,
    ...uniqueNames.map(n => `- ${n}`),
    ``,
    `These are not exhaustive — if you see elements not on this list, name them using the exact on-screen label text.`
  ].join('\n');
}
