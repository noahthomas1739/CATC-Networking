import 'server-only';
import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['jpeg', 'png', 'webp']);

export class ImageRejected extends Error {}

/**
 * Validate by content (not filename or client MIME type), then fully
 * re-encode. Re-encoding drops all metadata (EXIF, GPS, XMP, ICC comments)
 * and any payload smuggled after the image data.
 */
export async function processProfilePhoto(input: Buffer): Promise<Buffer> {
  if (input.length === 0 || input.length > MAX_UPLOAD_BYTES) throw new ImageRejected('size');
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    meta = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new ImageRejected('unreadable');
  }
  if (!meta.format || !ALLOWED.has(meta.format) || (meta.pages ?? 1) > 1) throw new ImageRejected('type');
  return sharp(input, { limitInputPixels: 40_000_000, failOn: 'error' })
    .rotate() // apply EXIF orientation before the metadata is discarded
    .resize(400, 400, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer();
}
