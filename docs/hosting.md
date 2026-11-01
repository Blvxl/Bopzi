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

## 3. Deploy on Railway
Bopzi runs as a normal Node server, so Railway needs no special setup.
1. Push the repository to GitHub (private is fine). At railway.com choose New Project, then Deploy from GitHub repo.
2. Under Variables add the settings from step 2, plus `SUPABASE_SERVICE_ROLE_KEY` (step 5). Do not add anything else.
3. Under Settings set the build command to `npm run build` and the start command to `npm run start:web`.
4. Under Settings, Networking, generate a domain, or add your own. Set `NEXT_PUBLIC_SITE_URL` to that address and redeploy. The `NEXT_PUBLIC_` values are baked in at build time, so they must be set before the build.
5. Put that address in Supabase (step 1.3). Keep `http://localhost:3000/auth/callback` there while you develop.
6. Rate limiting: Railway runs one copy of the app, so the built-in limits on the avatar, prepare and delete routes are real. For more protection put Cloudflare's free proxy in front of your domain and add a rate-limit rule for `/api/*`.

I have not checked Railway's current plans or prices.

## 4. Before opening to everyone
- Test sign-up, log-in, password reset and Google with two different accounts.
- Add a Content-Security-Policy header after testing it with the editor.
