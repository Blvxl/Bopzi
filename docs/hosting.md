# Hosting Bopzi as a website

Bopzi runs as a website with free accounts when a Supabase project is configured. Without one it keeps using license keys (the desktop build).

## 1. Supabase (accounts)
1. Create a project at supabase.com. Pick an EU region.
2. Authentication > Providers: keep Email on, turn **Confirm email** on, and add Google (create an OAuth client in Google Cloud; its redirect URL is shown in Supabase).
3. Authentication > URL configuration: set Site URL to your domain and add `https://YOUR-DOMAIN/auth/callback` to the redirect URLs. Add nothing else.
4. Authentication > Rate limits and password protection: keep the defaults on, set a minimum password length of 8 and turn on leaked-password protection if your plan has it.
5. Copy the project URL and the **publishable** key. The **service-role** key (Project Settings, API Keys) is secret: it goes only in the host's `SUPABASE_SERVICE_ROLE_KEY` variable, which lets the "Delete my account" button work. Never put it in a `NEXT_PUBLIC_` variable, in git, or in chat.

## 2. Settings on the host
```
NEXT_PUBLIC_SITE_URL=https://YOUR-DOMAIN
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```
Optional: `NEXT_PUBLIC_DONATE_URL`, `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT`.

**Never set** `BOPZI_LOCAL_CHATGPT` on the host. It switches on routes that read files and run programs on the server, and a visitor can fake the `Host` header to reach them.

## 3. Deploy on Cloudflare (Workers Builds)
Cloudflare runs Next.js through the OpenNext adapter (`wrangler.jsonc`, `open-next.config.ts`). The build cannot run on Windows without Developer Mode, so let Cloudflare's own Linux builder do it.
1. Push the repository to GitHub. In the Cloudflare dashboard open Workers & Pages, then Create, then Import a repository, and pick it.
2. Project name `bopzi` (it must match `name` in `wrangler.jsonc`). Build command `npm install && npm run cf:build`. Deploy command `npx opennextjs-cloudflare deploy`.
3. Under Variables and secrets, add as **build variables**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL` and `NODE_VERSION=24`. They are baked in at build time. Add `SUPABASE_SERVICE_ROLE_KEY` as a **secret**, not a plain variable. Do not set `BOPZI_WEB` here.
4. The address is `bopzi.<your-subdomain>.workers.dev`. Set `NEXT_PUBLIC_SITE_URL` to it, rebuild, and add it to Supabase (step 1.3). Add your own domain under Settings, Domains and routes.
5. Rate limiting: in Cloudflare, Security, WAF, Rate limiting rules, add a rule for `/api/*`. The built-in limits only count per running copy, and Workers can run many copies.

**Free plan size limit.** One source lists 3 MiB (compressed) for the free plan and 10 MiB for the paid one. If the deploy stops with a "too large" error, the free plan is not enough. I could not measure the size here. The adapter also calls its support for `proxy.ts` (the file that keeps logins fresh) experimental, so test sign-up, log-in and log-out after the first deploy.

## 4. Before opening to everyone
- Test sign-up, log-in, password reset and Google with two different accounts.
- Add a Content-Security-Policy header after testing it with the editor.
