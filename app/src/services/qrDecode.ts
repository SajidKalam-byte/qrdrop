import jpeg from 'jpeg-js';
import jsQR from 'jsqr';

/**
 * Pure-JS QR decoding of a base64 JPEG. Used as a backup when the native ML Kit scanner
 * stays silent (it does on some Android phones). No native code, so it ships over the air.
 */
export function decodeQrFromJpegBase64(b64: string): { data: string | null; width: number; height: number } {
  const bin: string = (globalThis as any).atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
  const pixels = new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length);
  // our QR is dark-on-white; skipping the inverted pass halves the time
  const hit = jsQR(pixels, img.width, img.height, { inversionAttempts: 'dontInvert' });
  return { data: hit?.data ?? null, width: img.width, height: img.height };
}

/** Pick the available camera picture size closest to (but not above) ~640x480: big enough to read, quick to decode in JS. */
export function pickPictureSize(sizes: string[]): string | undefined {
  const parsed = sizes
    .map((s) => {
      const m = /^(\d+)\s*x\s*(\d+)$/i.exec(s);
      return m ? { s, area: Number(m[1]) * Number(m[2]) } : null;
    })
    .filter((v): v is { s: string; area: number } => !!v)
    .sort((a, b) => a.area - b.area);
  const fit = parsed.filter((p) => p.area <= 640 * 480).pop();
  return (fit ?? parsed[0])?.s;
}
