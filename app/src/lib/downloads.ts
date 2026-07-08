import { desktopCapabilities } from './desktopCapabilities';
import { useUiStore } from '../stores/uiStore';

export async function downloadUrl(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  if (desktopCapabilities.canSaveTextFile) {
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
