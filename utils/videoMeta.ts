import { execFileSync } from 'child_process';

/**
 * Detects video resolution via ffprobe. Falls back to 1920×1080 if ffprobe
 * is unavailable or the video path doesn't exist (e.g., YouTube URL only).
 */
export function detectViewportResolution(
  videoPath: string | null
): { width: number; height: number } {
  const DEFAULT = { width: 1920, height: 1080 };
  if (!videoPath) return DEFAULT;
  try {
    const raw = execFileSync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', videoPath],
      { stdio: 'pipe', timeout: 10000 }
    ).toString();
    const { streams } = JSON.parse(raw);
    if (streams?.[0]?.width && streams?.[0]?.height) {
      return { width: streams[0].width, height: streams[0].height };
    }
  } catch { /* ffprobe not available or video not local */ }
  return DEFAULT;
}
