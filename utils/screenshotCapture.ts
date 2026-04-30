import { execFileSync } from 'child_process';
import path from 'path';
import type { ActionItem } from '../types.ts';
import { parseMMSS } from './timeUtils.ts';

/**
 * Captures one video frame per unique action timestamp.
 * Returns a map of action ID → screenshot filename.
 * Non-fatal: failures are logged but don't block the pipeline.
 */
export function captureActionScreenshots(
  videoPath: string,
  actions: ActionItem[],
  outputDir: string
): Map<string, string> {
  const refs = new Map<string, string>();

  // Group actions by timestamp (multiple actions may share a second)
  const byTimestamp = new Map<string, string[]>();
  for (const action of actions) {
    if (!byTimestamp.has(action.timestamp)) byTimestamp.set(action.timestamp, []);
    byTimestamp.get(action.timestamp)!.push(action.id);
  }

  for (const [timestamp, actionIds] of byTimestamp) {
    const seconds = parseMMSS(timestamp);
    const filename = `frame-${String(seconds).padStart(5, '0')}.png`; // Keyed on integer seconds; format-normalised timestamps share a file
    const outputPath = path.join(outputDir, filename);

    try {
      execFileSync(
        'ffmpeg',
        ['-ss', String(seconds), '-i', videoPath, '-vframes', '1', '-q:v', '2', outputPath, '-y'],
        { stdio: 'pipe', timeout: 15000 }
      );
      for (const id of actionIds) {
        refs.set(id, filename);
      }
    } catch (e: any) {
      console.warn(`Screenshot capture failed at ${timestamp}: ${e.message}`);
    }
  }

  return refs;
}
