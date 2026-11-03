/**
 * Where the pages get their data.
 *  - On a computer running the collector, from this site's own API (/api/...), which reads the local database.
 *  - On the public website, from files the collector publishes (collector/publish.mjs): NEXT_PUBLIC_DATA_URL points at them, for
 *    example  https://<project>.supabase.co/storage/v1/object/public/site . The site's own server has no database to read.
 */
export const DATA_URL = (process.env.NEXT_PUBLIC_DATA_URL ?? '').replace(/\/+$/, '');

/** True when the data comes from published files and not from the local database. */
export const PUBLISHED = DATA_URL !== '';

/** A published file, asked for again every `every` ms (the files are cached for a few seconds, so this is the finest useful step). */
export const published = (name: string, every = 15_000) => `${DATA_URL}/${name}?t=${Math.floor(Date.now() / every)}`;
