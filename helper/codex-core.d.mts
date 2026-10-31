export function findCodex(): Promise<string | null>;
export function codexStatus(): Promise<{ connected: boolean; reason: string }>;
export function codexSignIn(): Promise<string>;
export function codexCancelSignIn(): void;
export function codexSignOut(): Promise<void>;
export function codexAccount(): Promise<{ id: string; name: string; email: string; plan: string } | null>;
export function codexPicture(): Promise<{ type: string; bytes: Uint8Array<ArrayBuffer> } | null>;
export function codexAsk(job: { question: string; images?: string[]; signal?: AbortSignal; timeoutMs?: number; model?: string; effort?: string }): Promise<string>;
export function codexImage(job: { prompt: string; images?: string[]; look?: string[]; notes?: string; shape?: 'wide' | 'square'; model?: string; signal?: AbortSignal; timeoutMs?: number; onScene?: (scene: string) => void }): Promise<{ image: string; notes: string }>;
