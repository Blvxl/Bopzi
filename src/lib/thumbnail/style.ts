/** A trait stated in words holds better than one implied by a picture, so the inspiration's measured look goes along with it. */

const bytesOf = (dataUrl: string) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
const sharpLib = async () => (await import('sharp')).default;

/**
 * What can be measured reliably: how saturated and how bright.
 * Outlines, flat or 3D, and shading are not measured: pixels misjudged them (a flat cartoon with a textured
 * ground read as "detailed"). Those are described by whoever can actually look at the image.
 */
export async function styleNotes(dataUrl: string) {
  const sharp = await sharpLib();
  const { data, info } = await sharp(bytesOf(dataUrl)).resize({ width: 256 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const luma = new Float32Array(info.width * info.height);
  let saturation = 0, brightness = 0;
  for (let p = 0, i = 0; p < luma.length; p++, i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b);
    luma[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    saturation += max ? (max - Math.min(r, g, b)) / max : 0;
    brightness += luma[p];
  }
  saturation /= luma.length;
  brightness /= luma.length * 255;
  const notes = [
    saturation >= 0.6 ? 'strongly saturated colours' : saturation <= 0.4 ? 'muted colours' : 'moderately saturated colours',
    brightness >= 0.58 ? 'bright overall' : brightness <= 0.4 ? 'dark overall' : 'mid-toned overall',
  ];
  return notes.join('; ');
}
