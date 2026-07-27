import { desktopCapabilities } from './desktopCapabilities';
import { useUiStore } from '../stores/uiStore';

export async function downloadResponse(
  response: Response,
  filename: string,
  options: { saveAsText?: boolean } = {},
) {
  if (options.saveAsText && desktopCapabilities.canSaveTextFile) {
    return desktopCapabilities.saveTextFile(filename, await response.text(), useUiStore.getState().exportDirectory);
  }

  const blobUrl = URL.createObjectURL(await response.blob());
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.rel = 'noopener noreferrer';
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }
  return filename;
}

export function responseFilename(response: Response, fallback: string) {
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // Fall through to the quoted/simple filename form.
    }
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] || fallback;
}
