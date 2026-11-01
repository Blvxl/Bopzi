import { imageMime, isRobloxImageUrl } from './references';
import { fetchImage } from './fetch-image';
import { robloxFetch } from './roblox-fetch';

/**
 * A real avatar gives the image model something authentic to redraw, instead of inventing a cartoon lookalike.
 * This fetches Roblox's own full-body render of a user's current avatar. Public data, no sign-in.
 */

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type AvatarReference = { name: string; data: string };

/** The user a profile link points at. The number in the link is all that is used. */
async function userById(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('That is not a Roblox profile link.');
  const res = await robloxFetch(`https://users.roblox.com/v1/users/${id}`, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (res.status === 404) throw new Error('That Roblox profile was not found.');
  if (!res.ok) throw new Error(`Roblox could not be reached (error ${res.status}). Try again in a moment.`);
  const user = (await res.json()) as { id?: number; name?: string; isBanned?: boolean };
  if (!user.id || !user.name || user.isBanned) throw new Error('That Roblox profile was not found.');
  return { id: user.id, name: user.name };
}

async function userByName(username: string) {
  const wanted = username.trim().replace(/^@/, '');
  if (!USERNAME.test(wanted)) throw new Error('Enter a Roblox username: 3 to 20 letters, numbers or underscores.');

  const lookup = await robloxFetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usernames: [wanted], excludeBannedUsers: true }),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (!lookup.ok) throw new Error(`Roblox could not be reached (error ${lookup.status}). Try again in a moment.`);
  const user = ((await lookup.json()) as { data?: { id: number; name: string }[] }).data?.[0];
  if (!user) throw new Error(`No Roblox user called "${wanted}" was found.`);
  return user;
}

/** By username, or by the user id from a profile link. */
export async function avatarReference(who: { username?: string; userId?: number }): Promise<AvatarReference> {
  const user = who.userId !== undefined ? await userById(who.userId) : await userByName(who.username ?? '');

  // Renders are made on demand, so a fresh one can report "Pending" for a moment.
  let imageUrl = '';
  for (let attempt = 0; attempt < 4 && !imageUrl; attempt++) {
    if (attempt) await wait(900);
    const res = await robloxFetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.id}&size=720x720&format=Png&isCircular=false`, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!res.ok) continue;
    const thumb = ((await res.json()) as { data?: { state: string; imageUrl: string }[] }).data?.[0];
    if (thumb?.state === 'Blocked') throw new Error('Roblox has not approved that avatar for display.');
    if (thumb?.state === 'Completed' && isRobloxImageUrl(thumb.imageUrl)) imageUrl = thumb.imageUrl;
  }
  if (!imageUrl) throw new Error('Roblox is still rendering that avatar. Try again in a few seconds.');

  const image = await fetchImage(imageUrl, AbortSignal.timeout(15000));
  if (!image.ok) throw new Error('The avatar image could not be downloaded.');
  const bytes = Buffer.from(await image.arrayBuffer());
  if (bytes.length > 8_000_000) throw new Error('The avatar image is too large.');
  imageMime(bytes); // throws if Roblox sent something that is not an image
  return { name: user.name, data: `data:image/png;base64,${(await cropToFigure(bytes).catch(() => bytes)).toString('base64')}` };
}

/** Roblox pads the render with a lot of empty space. Cropping to the figure gives the model more avatar to look at. */
async function cropToFigure(bytes: Buffer) {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return bytes;
  const pad = 16;
  const left = Math.max(0, x0 - pad), top = Math.max(0, y0 - pad);
  return sharp(bytes).extract({ left, top, width: Math.min(info.width, x1 + pad + 1) - left, height: Math.min(info.height, y1 + pad + 1) - top }).png().toBuffer();
}
