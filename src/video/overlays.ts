import { iconImage } from './icons';
import { overlayBox, type Media, type Overlay } from './model';

/** Draws one overlay if its picture has loaded. Used by the preview and the export alike. */
export function drawOverlay(ctx: CanvasRenderingContext2D, overlay: Overlay, width: number, height: number, image: HTMLImageElement | undefined) {
  if (!image?.complete || !image.naturalWidth) return;
  const box = overlayBox(overlay, width, height, image.naturalWidth / image.naturalHeight);
  ctx.drawImage(image, box.x, box.y, box.w, box.h);
}

/** The overlay's picture: a logo from the built-in set, or the project's own image. */
export function overlayPicture(overlay: Overlay, images: (assetId: string) => HTMLImageElement | undefined) {
  return overlay.source === 'icon' ? iconImage(overlay.icon!, overlay.style) : images(overlay.assetId!);
}

/** For export: waits until the picture is decoded, so the first frame is never empty. */
export async function loadOverlayPicture(overlay: Overlay, assets: Media[]) {
  const image = overlay.source === 'icon' ? iconImage(overlay.icon!, overlay.style) : Object.assign(new Image(), { src: assets.find(a => a.id === overlay.assetId)?.url ?? '' });
  await image.decode().catch(() => {});
  return image;
}
