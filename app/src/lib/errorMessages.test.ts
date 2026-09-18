import { describe, expect, test } from 'bun:test';
import { friendlyErrorMessage, localizedErrorPresentation } from './errorMessages';

describe('localized error messages', () => {
  test('maps maintained error codes to the selected interface language', () => {
    const error = new Error(JSON.stringify({ error_code: 'FFPROBE_FAILED', message: 'binary missing' }));
    expect(friendlyErrorMessage(error, 'zh')).toBe('无法读取媒体文件，请检查 ffprobe 是否可用。');
    expect(friendlyErrorMessage(error, 'en')).toBe('Unable to read the media file. Check that ffprobe is available.');
  });

  test('keeps raw backend text only as technical detail for unknown errors', () => {
    const raw = 'upstream failed with an internal English-only message';
    expect(localizedErrorPresentation(new Error(raw), 'zh')).toEqual({
      summary: '操作未能完成，请查看技术详情后重试。',
      detail: raw,
    });
    expect(localizedErrorPresentation(new Error(raw), 'en')).toEqual({
      summary: 'The operation could not be completed. Review the technical details and retry.',
      detail: raw,
    });
  });
});
