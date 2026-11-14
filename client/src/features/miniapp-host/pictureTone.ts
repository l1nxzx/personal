import { useQuery } from '@tanstack/react-query';
import type { MiniappWallpaper } from '../../../../shared/types';
import { API_BASE } from '../../lib/apiFetch';
import { readJSON, writeJSON } from '../../lib/storage';

/**
 * How bright a wallpaper picture is, so labels and the bottom bar can match it: `ink` for the
 * screen (its upper part, where labels are), `bar` for the bottom strip under the bar. 'dark'
 * means dark text on a light picture. Worked out once per picture in the browser (a tiny copy
 * drawn to a canvas) and remembered on the device.
 */
export interface PictureTone {
  ink: 'light' | 'dark';
  bar: 'light' | 'dark';
}

const FALLBACK: PictureTone = { ink: 'light', bar: 'light' };
const cacheKey = (version: string) => `miniapp:tone:${version}`;
/** Above this mean luminance (0 to 1), dark text reads better than white. */
const BRIGHT = 0.6;

export const pictureUrl = (version: string) => `${API_BASE}/miniapps/wallpaper/${version}`;

function measure(version: string): Promise<PictureTone> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = 24;
        const h = 48;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d', { willReadFrequently: true })!;
        // Cropped like the screen (portrait, centred, covering).
        const scale = Math.max(w / img.width, h / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        const px = g.getImageData(0, 0, w, h).data;
        const lum = (y0: number, y1: number) => {
          let sum = 0;
          let n = 0;
          for (let y = y0; y < y1; y++)
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const [r, gg, b] = [px[i]!, px[i + 1]!, px[i + 2]!].map((v) => {
                const s = v / 255;
                return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
              });
              sum += 0.2126 * r! + 0.7152 * gg! + 0.0722 * b!;
              n++;
            }
          // Perceived lightness (L*), 0 to 1, so the threshold is intuitive.
          const Y = sum / n;
          return (Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y) / 100;
        };
        const tone: PictureTone = {
          ink: lum(0, Math.round(h * 0.65)) > BRIGHT ? 'dark' : 'light',
          bar: lum(Math.round(h * 0.88), h) > BRIGHT ? 'dark' : 'light',
        };
        writeJSON(cacheKey(version), tone);
        resolve(tone);
      } catch {
        // A picture from another origin can't be read; white labels on a shade are safe.
        resolve(FALLBACK);
      }
    };
    img.onerror = () => resolve(FALLBACK);
    img.src = pictureUrl(version);
  });
}

/** The picture's tone (null for wallpapers that aren't pictures, and until it is known). */
export function usePictureTone(w: MiniappWallpaper | undefined): PictureTone | null {
  const version = w?.kind === 'image' ? w.version : '';
  const q = useQuery({
    queryKey: ['miniapps', 'tone', version],
    queryFn: () => measure(version),
    enabled: !!version,
    staleTime: Infinity,
    gcTime: Infinity,
    initialData: () =>
      version ? (readJSON<PictureTone>(cacheKey(version)) ?? undefined) : undefined,
  });
  return version ? (q.data ?? null) : null;
}
