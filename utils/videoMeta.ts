import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Detects video resolution via ffprobe. Falls back to 1920×1080 if ffprobe
 * is unavailable or the video path doesn't exist (e.g., YouTube URL only).
 */
export async function detectViewportResolution(
  videoPath: string | null
): Promise<{ width: number; height: number }> {
  const DEFAULT = { width: 1920, height: 1080 };
  if (!videoPath) return DEFAULT;

  // Only attempt ffprobe for local file paths
  function isLocalPath(url: string): boolean {
    try { return new URL(url).protocol === 'file:'; } catch { return true; /* not a URL, treat as local path */ }
  }

  if (!isLocalPath(videoPath)) return DEFAULT;

  try {
    const { stdout: raw } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', videoPath],
      { timeout: 10000 }
    );
    const { streams } = JSON.parse(raw);
    if (streams?.[0]?.width && streams?.[0]?.height) {
      return { width: streams[0].width, height: streams[0].height };
    }
  } catch { /* ffprobe not available or video not local */ }
  return DEFAULT;
}
