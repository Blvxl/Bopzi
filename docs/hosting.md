# Hosting Bopzi as a website

Bopzi runs as a website with free accounts when a Supabase project is configured. Without one it keeps using license keys (the desktop build).

## 1. Supabase (accounts)
1. Create a project at supabase.com. Pick an EU region.
2. Authentication > Providers: keep Email on, turn **Confirm email** on, and add Google (create an OAuth client in Google Cloud; its redirect URL is shown in Supabase).
3. Authentication > URL configuration: set Site URL to your domain and add `https://YOUR-DOMAIN/auth/callback` to the redirect URLs. Add nothing else.
4. Authentication > Rate limits and password protection: keep the defaults on, set a minimum password length of 8 and turn on leaked-password protection if your plan has it.
5. Copy the project URL and the **publishable** key. Never use the service-role key in this app.

## 2. Settings on the host
```
NEXT_PUBLIC_SITE_URL=https://YOUR-DOMAIN
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```
Optional: `NEXT_PUBLIC_DONATE_URL`, `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT`.

**Never set** `BOPZI_LOCAL_CHATGPT` on the host. It switches on routes that read files and run programs on the server, and a visitor can fake the `Host` header to reach them.

## 3. Deploy on Vercel (recommended)
Bopzi is a normal Next.js app, and the heavy packages (the background remover) only run in the visitor's browser, so a standard Next.js host fits.
1. Push the repository to GitHub (private is fine) and import it at vercel.com/new.
2. Add the three settings from step 2 under Project Settings, Environment Variables. Do not add anything else.
3. Deploy. Vercel gives you a `*.vercel.app` address; add your own domain under Settings, Domains.
4. Set `NEXT_PUBLIC_SITE_URL` to the final address and redeploy, then put that address in Supabase (step 1.3). Keep `http://localhost:3000/auth/callback` there too while you develop.
5. Rate limiting: under the project's Firewall, add a rule that limits `/api/*` to about 60 requests per minute per address. The routes also have a small built-in limit, but it only counts per server copy.

**Check the host's terms before turning on ads or the support link.** Vercel's free Hobby plan is described as for personal, non-commercial use, so a site with ads probably needs a paid plan or a different host (Railway or Fly.io run `npm run build` then `npm run start:web`). I have not checked current plans or prices.

## 4. Before opening to everyone
- Test sign-up, log-in, password reset and Google with two different accounts.
- Add account deletion (a server function using the service-role key, kept as a host secret) and update the privacy page: e-mail addresses are stored by Supabase.
- Add a Content-Security-Policy header after testing it with the editor.
