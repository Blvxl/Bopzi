/** A conservative, local polish; no generative redraw, and the original file is kept separately. */
export async function polishScreenshot(file: File): Promise<File> {
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not open the image editor.');
    const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
    context.fillStyle = '#151619'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = 'brightness(1.06) contrast(1.12) saturate(1.06)';
    if (context.filter === 'none') throw new Error('This browser does not support screenshot polish. Try another browser.');
    context.drawImage(image, (canvas.width - image.width * scale) / 2, (canvas.height - image.height * scale) / 2, image.width * scale, image.height * scale);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not save the polished screenshot.')), 'image/png'));
    return new File([blob], 'Polished screenshot.png', { type: 'image/png' });
  } finally { image.close(); }
}
