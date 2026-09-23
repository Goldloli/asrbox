import type { Locale } from '../stores/uiStore';

type ErrorPresentation = {
  summary: string;
  detail: string;
};

function errorPayload(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { code: null, detail: raw };
  }
  if (!parsed || typeof parsed !== 'object') return { code: null, detail: raw };
  const payload = parsed as { error_code?: unknown; message?: unknown };
  const detail = typeof payload.message === 'string' ? payload.message : raw;
  return { code: typeof payload.error_code === 'string' ? payload.error_code : null, detail };
}

export function localizedErrorPresentation(error: unknown, locale: Locale): ErrorPresentation {
  const { code, detail } = errorPayload(error);
  if (code === 'FFPROBE_FAILED') {
    return {
      summary: locale === 'zh'
        ? '无法读取媒体文件，请检查 ffprobe 是否可用。'
        : 'Unable to read the media file. Check that ffprobe is available.',
      detail,
    };
  }
  if (code === 'FFMPEG_FAILED') {
    return {
      summary: locale === 'zh'
        ? '无法提取音频，请检查 ffmpeg 是否可用。'
        : 'Unable to extract audio. Check that ffmpeg is available.',
      detail,
    };
  }
  if (code === 'LANGUAGE_REQUIRED') {
    return {
      summary: locale === 'zh'
        ? '该模型不支持自动语种检测，请在任务设置中手动选择语言后重试。'
        : 'This model has no automatic language detection. Pick an explicit language in the task settings and retry.',
      detail,
    };
  }
  return {
    summary: locale === 'zh'
      ? '操作未能完成，请查看技术详情后重试。'
      : 'The operation could not be completed. Review the technical details and retry.',
    detail,
  };
}

export function friendlyErrorMessage(error: unknown, locale: Locale = 'en') {
  return localizedErrorPresentation(error, locale).summary;
}
