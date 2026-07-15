// Regenerates the PWA install icons from the existing Android launcher icon.
// Run with: node scripts/generate-pwa-icons.mjs
// Swap the SOURCE path (or run against a higher-resolution master) if a
// better source icon becomes available later.
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(__dirname, "../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png");
const OUT_DIR = path.resolve(__dirname, "../src/mobile/public/icons");

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  // Maskable icons need safe-zone padding (~20%) since the OS may crop to a
  // circle/squircle — scale the source down inside a padded canvas instead
  // of stretching it edge-to-edge.
  { file: "icon-maskable-512.png", size: 512, maskable: true },
];

for (const t of targets) {
  const img = sharp(SOURCE);
  if (t.maskable) {
    const inner = Math.round(t.size * 0.6);
    await img
      .resize(inner, inner)
      .extend({
        top: Math.round((t.size - inner) / 2),
        bottom: Math.round((t.size - inner) / 2),
        left: Math.round((t.size - inner) / 2),
        right: Math.round((t.size - inner) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(path.join(OUT_DIR, t.file));
  } else {
    await img.resize(t.size, t.size).png().toFile(path.join(OUT_DIR, t.file));
  }
  console.log(`wrote ${t.file}`);
}
