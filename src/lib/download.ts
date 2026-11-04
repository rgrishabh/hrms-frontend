import { api } from '../api';

/** Saves a file from the API. Throws an ApiError on failure, so the caller can say what went wrong. */
export async function downloadFile(url: string, fallbackName: string): Promise<void> {
  const { blob, fileName } = await api.blob(url);
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName ?? fallbackName;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoked later, because some browsers read the URL after click() returns.
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
}
