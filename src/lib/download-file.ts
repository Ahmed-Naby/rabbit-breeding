/**
 * How a generated file reaches the user. The browser and Electron can just take
 * a Blob; Android can't, which is why this is a seam and not a one-liner — see
 * src/mobile/lib/save-file.ts.
 */
export type FileSaver = (
  bytes: Uint8Array,
  filename: string,
  mime: string
) => void | Promise<void>;

export const downloadInBrowser: FileSaver = (bytes, filename, mime) => {
  // A fresh ArrayBuffer copy: a Uint8Array view over a larger buffer would hand
  // Blob the whole thing, and TS's BlobPart doesn't accept the view type since
  // ArrayBufferLike may be a SharedArrayBuffer.
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
