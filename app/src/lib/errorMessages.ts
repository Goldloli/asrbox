export function friendlyErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!parsed || typeof parsed !== 'object') return raw;
  const payload = parsed as { error_code?: unknown; message?: unknown };
  const detail = typeof payload.message === 'string' ? payload.message : raw;
  if (payload.error_code === 'FFPROBE_FAILED') return `无法读取媒体文件：缺少 ffprobe 或路径不可用。${detail}`;
  if (payload.error_code === 'FFMPEG_FAILED') return `无法提取音频：缺少 ffmpeg 或路径不可用。${detail}`;
  return detail;
}
