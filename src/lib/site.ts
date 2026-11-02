/** Canonical public address for metadata, robots.txt, and sitemap.xml. Keep localhost for development only. */
const defaultSiteURL = process.env.NODE_ENV === 'production' ? 'https://bopzi.dev' : 'http://localhost:3000';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? defaultSiteURL).replace(/\/+$/, '');

export const SITE_NAME = 'Bopzi';
export const SITE_TAGLINE = 'Roblox research, answered.';
export const SITE_DESCRIPTION = 'Free Roblox market research. See which games are rising, what genres are growing, and ask an AI analyst that answers from real player numbers.';

/** There is no direct Discord profile link configured, so give the user a clear search instruction. */
export const HELP_TEXT = 'Contact @blvxl on Discord';
