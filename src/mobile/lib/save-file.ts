import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { downloadInBrowser, type FileSaver } from "@/lib/download-file";

/**
 * Android WebViews don't honour `<a download>`, so a file has to be written to
 * cache and handed to the native share sheet — the user then picks Drive, or
 * WhatsApp, or Files. Electron's renderer is plain Chromium, where the Blob
 * download works, and so is the browser.
 */

/** Filesystem.writeFile wants base64 when no encoding is given. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // In chunks: String.fromCharCode(...bytes) blows the argument limit on
  // anything past a few tens of thousands of bytes, and a spreadsheet is well
  // past that.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function shareFromCache(filename: string): Promise<void> {
  const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: filename });
  await Share.share({ title: filename, url: uri });
}

/** Text files — the JSON backup. */
export async function saveTextFile(text: string, filename: string, mime: string): Promise<void> {
  if (Capacitor.getPlatform() === "android") {
    await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await shareFromCache(filename);
    return;
  }
  downloadInBrowser(new TextEncoder().encode(text), filename, mime);
}

/** Binary files — the xlsx exports. */
export const saveBinaryFile: FileSaver = async (bytes, filename, mime) => {
  if (Capacitor.getPlatform() === "android") {
    await Filesystem.writeFile({
      path: filename,
      data: toBase64(bytes),
      directory: Directory.Cache,
    });
    await shareFromCache(filename);
    return;
  }
  downloadInBrowser(bytes, filename, mime);
};
