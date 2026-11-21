/**
 * Hands a file the app has just received to the browser's own download, so the user chooses
 * where it goes. The API needs the access token, which lives only in memory, so a plain link
 * to the file cannot be used: the app fetches it and saves it from here.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // The browser has started the download by now; the link to the data is no longer needed.
  URL.revokeObjectURL(url);
}
