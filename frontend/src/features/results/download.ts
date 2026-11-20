/** Triggers a browser download of `text` as `filename`, without navigating away from the app. */
export function downloadText(text: string, filename: string, mimeType: string): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}

/** Triggers a browser download of a data URL (e.g. `canvas.toDataURL()`) as `filename`. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  triggerDownload(dataUrl, filename);
}

function triggerDownload(href: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  // Not attached to the document: Firefox and Chrome both allow a detached anchor's click() to
  // start a download, and this avoids leaving stray nodes behind if the download is cancelled.
  anchor.click();
}
