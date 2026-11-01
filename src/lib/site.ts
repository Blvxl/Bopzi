/** Canonical public address for metadata, robots.txt, and sitemap.xml. Keep localhost for development only. */
const defaultSiteURL = process.env.NODE_ENV === 'production' ? 'https://bopzi.dev' : 'http://localhost:3000';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? defaultSiteURL).replace(/\/+$/, '');

export const SITE_NAME = 'Bopzi';
export const SITE_DESCRIPTION = 'Free Roblox thumbnail maker. Describe your game, generate the art with your own ChatGPT plan, and finish it with text and layers in your browser.';

/** There is no direct Discord profile link configured, so give the user a clear search instruction. */
export const HELP_TEXT = 'Contact @blvxl on Discord';


/** Where "Support Bopzi" points (Ko-fi, GitHub Sponsors, ...). Nothing is shown while this is empty. */
export const DONATE_URL = process.env.NEXT_PUBLIC_DONATE_URL ?? '';
/** Google AdSense publisher id (ca-pub-...) and the ad unit's slot id. No ads are shown while either is empty. */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? '';
export const ADSENSE_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT ?? '';
