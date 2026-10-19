import sharp from 'sharp';
import { badRequest } from '../lib/errors.js';

const MAX_DIMENSION = 1600;

/**
 * Normalises an uploaded image: applies EXIF rotation, caps size, re-encodes as WebP.
 * sharp drops all metadata (EXIF, GPS, ICC) unless asked to keep it, and decoding also
 * proves the upload really is an image.
 */
export async function processImage(input: Buffer): Promise<{ data: Buffer; contentType: string }> {
  try {
    const data = await sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
    return { data, contentType: 'image/webp' };
  } catch {
    throw badRequest('Uploaded file is not a valid image');
  }
}

/** Formats re-encoded on upload (resized, compressed, metadata stripped). GIFs are kept as-is. */
const REENCODE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff']);

export const isImage = (mime: string) => REENCODE.has(mime) || mime === 'image/gif';

/**
 * Documents library images: keeps the format (a JPEG stays a JPEG), caps the long edge at
 * 2400px, compresses, strips metadata such as GPS location, and makes a small WebP thumbnail.
 */
export async function processDocumentImage(
  input: Buffer,
  mime: string,
): Promise<{ data: Buffer; mime: string; thumb: Buffer }> {
  try {
    const thumb = await sharp(input, { limitInputPixels: 100_000_000, animated: false })
      .rotate()
      .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
    if (!REENCODE.has(mime)) return { data: input, mime, thumb };

    let img = sharp(input, { limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true });
    if (mime === 'image/png') img = img.png({ compressionLevel: 9, palette: false });
    else if (mime === 'image/webp') img = img.webp({ quality: 82 });
    else if (mime === 'image/avif') img = img.avif({ quality: 60 });
    else {
      img = img.jpeg({ quality: 82, mozjpeg: true });
      mime = 'image/jpeg';
    }
    return { data: await img.toBuffer(), mime, thumb };
  } catch {
    throw badRequest('This image could not be read. It may be damaged.');
  }
}
