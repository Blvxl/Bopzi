import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Where the collected data lives: ~/.bopzi/research/bopzi.sqlite, outside the project folder. Inside it, every write by the collector
 * counted as a change to the site, and the development server recompiled and reloaded the page over and over. Set BOPZI_DB to put it elsewhere.
 */
export const DB_FILE = process.env.BOPZI_DB ?? path.join(homedir(), '.bopzi', 'research', 'bopzi.sqlite');
