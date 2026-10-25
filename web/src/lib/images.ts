/** Pictures attached to drawer messages: `<sessions>/<slug>/images/<name>`. `bridge/protocol.mts` mirrors the name rule and the cap. */

export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export const MIME_OF: Record<string, string> = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([m, e]) => [e, m]));

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES = 6;
export const IMAGE_NAME = /^\d{8}T\d{6}-[0-9a-f]{6}\.(png|jpg|gif|webp)$/;

/** A fresh, unique-enough file name: UTC timestamp plus 6 random hex chars. */
export function imageName(ext: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${stamp}-${rand}.${ext}`;
}
