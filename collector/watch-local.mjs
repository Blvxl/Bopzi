// Local development collector: two loops, so the chart gets a point every few minutes while new games are found alongside.
//   tick      looks up every known game and saves the total; starts every TICK_MS, or right after the last one if that took longer
//   discover  searches for games that are on no list; runs one after another, separately from the ticks
import { spawn } from 'node:child_process';

const TICK_MS = 3 * 60 * 1000;
const DISCOVER_PAUSE_MS = 4 * 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A run that takes longer than this is stopped (it is stuck), so a stalled connection never freezes the chart for an hour. */
const MAX_RUN_MS = { tick: 6 * 60 * 1000, discover: 10 * 60 * 1000 };
const MAX_JOB_MS = 25 * 60 * 1000;
const watchdog = (child, ms, label) => {
  const t = setTimeout(() => { console.error(`${label} ran longer than ${Math.round(ms / 60000)} minutes; stopping it`); child.kill(); }, ms);
  child.on('exit', () => clearTimeout(t));
};

function run(mode) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--env-file-if-exists=.env.local', 'collector/run.mjs', mode], {
      stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
    });
    watchdog(child, MAX_RUN_MS[mode] ?? MAX_JOB_MS, mode);
    child.on('error', (error) => { console.error(error); resolve(); });
    child.on('exit', resolve);
  });
}

async function ticks() {
  for (;;) {
    const started = Date.now();
    await run('tick');
    await sleep(Math.max(5_000, TICK_MS - (Date.now() - started)));
  }
}

async function discoveries() {
  for (;;) {
    await run('discover');
    await sleep(DISCOVER_PAUSE_MS);
  }
}

/** A job from collector/enrich.mjs, run again every so often, one after another so they never overlap with themselves. */
async function every(job, ms, delay = 0, script = 'collector/enrich.mjs', arg = job) {
  await sleep(delay);
  for (;;) {
    const started = Date.now();
    await new Promise((resolve) => {
      const child = spawn(process.execPath, ['--env-file-if-exists=.env.local', script, arg], { stdio: 'inherit', env: script.endsWith('publish.mjs') ? process.env : { ...process.env, NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' } });
      watchdog(child, MAX_JOB_MS, job);
      child.on('error', (error) => { console.error(error); resolve(); });
      child.on('exit', resolve);
    });
    await sleep(Math.max(ms < 60_000 ? 10_000 : 30_000, ms - (Date.now() - started)));
  }
}

void every('publish', 30 * 1000, 60_000, 'collector/publish.mjs');
void every('publish', 5 * 60 * 1000, 120_000, 'collector/publish.mjs', 'all');
void ticks();
void every('tags', 30 * 60 * 1000, 40_000);      // names and descriptions change rarely
void every('looks', 30 * 60 * 1000, 90_000);     // icons of games not seen yet, 250 at a time
void every('searches', 3 * 60 * 60 * 1000, 150_000);
void every('events', 20 * 60 * 1000, 200_000);   // 100 games a time, the ones asked about longest ago first
// Start searching a little later so the first tick is not slowed down.
void sleep(20_000).then(discoveries);
