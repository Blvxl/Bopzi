/**
 * Carries a first action from the landing page into the studio.
 * Files cannot be serialised, so they ride in memory across the client-side navigation;
 * the background idea is small text and survives a reload in sessionStorage.
 */

export type StartPlan = { idea: string; genre: string };

let files: File[] = [];
const KEY = 'bopzi:start-plan';

export function handFiles(next: File[]) {
  files = next;
}

export function takeFiles() {
  const out = files;
  files = [];
  return out;
}

export function handPlan(plan: StartPlan) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    // Storage blocked: the studio simply opens the prompt builder empty.
  }
}

export function takePlan(): StartPlan | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const plan = JSON.parse(raw) as Partial<StartPlan>;
    return { idea: String(plan.idea ?? '').slice(0, 400), genre: String(plan.genre ?? '') };
  } catch {
    return null;
  }
}
