/** Where this Bopzi runs, without a trailing slash. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export const SITE_NAME = 'Bopzi';
export const SITE_DESCRIPTION = 'A creative studio for Roblox game thumbnails and icons.';
