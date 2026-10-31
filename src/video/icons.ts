import { siDiscord, siInstagram, siKick, siPatreon, siRoblox, siSpotify, siTiktok, siTwitch, siX, siYoutube, type SimpleIcon } from 'simple-icons';
import type { ICON_KEYS, Overlay } from './model';

/** Platform logos creators put on their videos. Shapes from Simple Icons (CC0); the brands are their owners'. */
export const ICONS: Record<(typeof ICON_KEYS)[number], { label: string; icon: SimpleIcon }> = {
  twitch: { label: 'Twitch', icon: siTwitch }, youtube: { label: 'YouTube', icon: siYoutube }, tiktok: { label: 'TikTok', icon: siTiktok },
  discord: { label: 'Discord', icon: siDiscord }, x: { label: 'X', icon: siX }, instagram: { label: 'Instagram', icon: siInstagram },
  kick: { label: 'Kick', icon: siKick }, roblox: { label: 'Roblox', icon: siRoblox }, spotify: { label: 'Spotify', icon: siSpotify }, patreon: { label: 'Patreon', icon: siPatreon },
};

/** The logo as an SVG picture in the overlay's style. Black logos turn white on video, where black would vanish. */
export function iconSvg(key: string, style: Overlay['style']) {
  const { icon } = ICONS[key as keyof typeof ICONS] ?? ICONS.twitch;
  const brand = icon.hex === '000000' ? '#ffffff' : `#${icon.hex}`;
  const glyph = (fill: string, inset = 0) => `<path transform="translate(${inset} ${inset}) scale(${(24 - inset * 2) / 24})" fill="${fill}" d="${icon.path}"/>`;
  const body = style === 'badge' ? `<rect width="24" height="24" rx="5.5" fill="${icon.hex === '000000' ? '#000000' : `#${icon.hex}`}"/>${glyph('#ffffff', 4.5)}` : glyph(style === 'white' ? '#ffffff' : brand);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512">${body}</svg>`;
}

const pictures = new Map<string, HTMLImageElement>();
/** A ready-to-draw picture of a logo, made once per logo and style. */
export function iconImage(key: string, style: Overlay['style']) {
  const id = `${key}:${style}`; let image = pictures.get(id);
  if (!image) { image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(key, style))}`; pictures.set(id, image); }
  return image;
}
