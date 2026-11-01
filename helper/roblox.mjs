// Roblox lookups made from the visitor's own computer. Roblox limits the shared addresses of web hosts, so the
// website asks the helper instead, and Roblox sees an ordinary home connection.
const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRobloxImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)rbxcdn\.com$/.test(url.hostname) && !url.port && !url.username && !url.password;
  } catch { return false; }
}

function imageMime(bytes) {
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  throw new Error('That was not an image.');
}

/** Asks again a couple of times when Roblox says "too many requests". */
async function ask(url, init = {}) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    last = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    if (last.status !== 429 && last.status < 500) return last;
    await wait(500 * (attempt + 1));
  }
  return last;
}

async function download(url) {
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('The image could not be downloaded.');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 8_000_000) throw new Error('The image is too large.');
  return { bytes, mime: imageMime(bytes) };
}

async function userById(id) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('That is not a Roblox profile link.');
  const res = await ask(`https://users.roblox.com/v1/users/${id}`);
  if (res.status === 404) throw new Error('That Roblox profile was not found.');
  if (!res.ok) throw new Error(`Roblox could not be reached (error ${res.status}). Try again in a moment.`);
  const user = await res.json();
  if (!user.id || !user.name || user.isBanned) throw new Error('That Roblox profile was not found.');
  return { id: user.id, name: user.name };
}

async function userByName(username) {
  const wanted = String(username ?? '').trim().replace(/^@/, '');
  if (!USERNAME.test(wanted)) throw new Error('Enter a Roblox username: 3 to 20 letters, numbers or underscores.');
  const res = await ask('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ usernames: [wanted], excludeBannedUsers: true }) });
  if (!res.ok) throw new Error(`Roblox could not be reached (error ${res.status}). Try again in a moment.`);
  const user = (await res.json()).data?.[0];
  if (!user) throw new Error(`No Roblox user called "${wanted}" was found.`);
  return user;
}

/** A Roblox user's avatar picture, by username or by the id from a profile link. */
export async function robloxAvatar(who) {
  const user = Number.isFinite(who?.userId) ? await userById(who.userId) : await userByName(who?.username);
  // Renders are made on demand, so a fresh one can report "Pending" for a moment.
  let imageUrl = '';
  for (let attempt = 0; attempt < 4 && !imageUrl; attempt++) {
    if (attempt) await wait(900);
    const res = await ask(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.id}&size=720x720&format=Png&isCircular=false`);
    if (!res.ok) continue;
    const thumb = (await res.json()).data?.[0];
    if (thumb?.state === 'Blocked') throw new Error('Roblox has not approved that avatar for display.');
    if (thumb?.state === 'Completed' && isRobloxImageUrl(thumb.imageUrl)) imageUrl = thumb.imageUrl;
  }
  if (!imageUrl) throw new Error('Roblox is still rendering that avatar. Try again in a few seconds.');
  const { bytes } = await download(imageUrl);
  return { name: user.name, data: `data:image/png;base64,${bytes.toString('base64')}` };
}

/** A picture hosted by Roblox's image servers, as data the page can use. Anything else is refused. */
export async function robloxImage(url) {
  if (typeof url !== 'string' || !isRobloxImageUrl(url)) throw new Error('That is not a Roblox image.');
  const { bytes, mime } = await download(url);
  return { data: `data:${mime};base64,${bytes.toString('base64')}` };
}
