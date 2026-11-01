export function robloxAvatar(who: { username?: string; userId?: number }): Promise<{ name: string; data: string }>;
export function robloxImage(url: string): Promise<{ data: string }>;
