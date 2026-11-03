// Local development collector: two loops, so the chart gets a point every few minutes while new games are found alongside.
//   tick      looks up every known game and saves the total; starts every TICK_MS, or right after the last one if that took longer
//   discover  searches for games that are on no list; runs one after another, separately from the ticks
import { spawn } from 'node:child_process';

const TICK_MS = 3 * 60 * 1000;
const DISCOVER_PAUSE_MS = 4 * 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(mode) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--env-file-if-exists=.env.local', 'collector/run.mjs', mode], {
      stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
    });
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

void ticks();
// Start searching a little later so the first tick is not slowed down.
void sleep(20_000).then(discoveries);
