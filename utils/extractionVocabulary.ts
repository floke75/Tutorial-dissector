import fs from 'fs';
import path from 'path';

/**
 * Generates a vocabulary hint string from the canonical glossary for a given software.
 * Returns empty string if no glossary exists for that software.
 * Intended to be passed as customContext to analyzeChunkPhaseA.
 */
export function generateExtractionVocabulary(
  glossaryPath: string,
  software: string,
  vocabularyContent?: string
): string {
  let elements: any;
  
  if (vocabularyContent) {
    try {
      elements = JSON.parse(vocabularyContent);
    } catch {
      return '';
    }
  } else {
    // Resolve safely within the project root
    const safePath = path.resolve(process.cwd(), path.basename(glossaryPath));
    if (!safePath.startsWith(process.cwd())) return '';
    if (!fs.existsSync(safePath)) {
      // Fallback to the old glossary/ directory if it doesn't exist in root
      const oldSafePath = path.resolve(process.cwd(), 'glossary', path.basename(glossaryPath));
      if (fs.existsSync(oldSafePath)) {
        try {
          elements = JSON.parse(fs.readFileSync(oldSafePath, 'utf-8'));
        } catch {
          return '';
        }
      } else {
        return '';
      }
    } else {
      try {
        elements = JSON.parse(fs.readFileSync(safePath, 'utf-8'));
      } catch {
        return ''; // malformed JSON — skip vocabulary rather than crashing
      }
    }
  }

  const softwareKeys = software.split(',').map(s => s.trim()).filter(Boolean);
  const elementsList: { app: string; section: string; canonical: string; type?: string; aliases?: string[] }[] = [];
  
  function walk(appName: string, sectionName: string, obj: any) {
    if (obj && typeof obj === 'object') {
      if (obj.canonical && typeof obj.canonical === 'string') {
        elementsList.push({
          app: appName,
          section: sectionName,
          canonical: obj.canonical,
          type: typeof obj.type === 'string' ? obj.type : undefined,
          aliases: Array.isArray(obj.aliases) ? obj.aliases.filter((a: any) => typeof a === 'string') : undefined,
        });
      }
      for (const [key, value] of Object.entries(obj)) {
        // Skip metadata, and skip arrays like 'aliases' so we don't unnecessarily traverse them
        if (key !== '_meta' && key !== 'aliases' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // If sectionName is empty, we are at the top level of the app, so 'key' is the section name.
          walk(appName, sectionName || key, value);
        }
      }
    }
  }

  let foundAny = false;
  for (const sw of softwareKeys) {
    const softwareElements = elements[sw];
    if (softwareElements) {
      foundAny = true;
      walk(sw, '', softwareElements);
    }
  }

  if (!foundAny) return '';

  // We want to group by app, then by section
  const groupedElements = new Map<string, Map<string, typeof elementsList[0][]>>();
  
  elementsList.forEach(el => {
    if (!groupedElements.has(el.app)) {
      groupedElements.set(el.app, new Map());
    }
    const appMap = groupedElements.get(el.app)!;
    if (!appMap.has(el.section)) {
      appMap.set(el.section, []);
    }
    
    // De-duplicate within the section
    const sectionList = appMap.get(el.section)!;
    const exists = sectionList.some(existing => existing.canonical === el.canonical && existing.type === el.type);
    if (!exists) {
      sectionList.push(el);
    }
  });

  if (groupedElements.size === 0) return '';

  const lines = [
    `# KNOWN UI ELEMENTS FOR SPECIFIED APPLICATIONS`,
    `The following canonical element names belong to the application(s) being analyzed.`,
    `Treat this vocabulary as a supplementary helper tool, not absolute ground truth.`,
    `While you should align with these canonical names and types when they accurately reflect the UI, always use your own judgment.`,
    `If the provided type seems inaccurate or misses a nuance based on the visual context, use the most appropriate type.`,
    ``
  ];

  for (const [appName, appMap] of groupedElements.entries()) {
    lines.push(`## Application: ${appName.toUpperCase()}`);
    for (const [sectionName, sectionElements] of appMap.entries()) {
      if (sectionElements.length === 0) continue;
      
      const friendlySection = sectionName.replace(/_/g, ' ').toUpperCase();
      lines.push(`\n### Section: ${friendlySection}`);
      
      for (const el of sectionElements) {
        let line = `- **${el.canonical}**`;
        if (el.type) {
          line += ` \`[Type: ${el.type}]\``;
        }
        lines.push(line);
        if (el.aliases && el.aliases.length > 0) {
          lines.push(`  - Aliases: ${el.aliases.join(', ')}`);
        }
      }
    }
    lines.push(``);
  }

  lines.push(`***\n*Note: These lists are not exhaustive — if you see elements not on this list, name them using the exact on-screen label text.*`);
  
  return lines.join('\n');
}
