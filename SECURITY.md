# Security

Bopzi is a local application. It runs a small server on `127.0.0.1` and only answers Bopzi's own pages. Do not expose that server or the optional helper to the internet. Do not share `~/.codex/auth.json`, `~/.bopzi`, `.env.local`, or other credentials and private files.

## Licenses

- A license key is signed by the owner and locked to one computer's device code. Keys are checked offline.
- Bopzi does not keep the key, and being logged in ends when the app closes. The one exception is an update: the key waits on disk for up to 5 minutes, for one use, so the restart does not log you out.
- The owner can disable a key. Bopzi reads a signed list of disabled keys every hour, and stops working if it can't reach the list for 7 days.
- The admin panel needs both the owner's signing key on the computer and the owner's ChatGPT account signed in.
- `~/.bopzi/license-private.pem` makes keys and signs updates. Never share or commit it, and keep a safe backup: without it, no new keys or updates can be made. `~/.bopzi/licenses.json` holds the record of users and deals, and stays private too.
- These checks run on the user's computer. They raise the effort needed to get around them, but they cannot make that impossible.

## Updates

An update is installed only if its manifest carries the owner's signature and the download matches the signed sha512.

## Data

- Projects are unencrypted JSON files in `.bopzi\library` in the user folder. Anyone with access to the Windows account can read them.
- AI generation sends prompts and attached images to OpenAI using the locally signed-in Codex session. Avatars, game details and thumbnails come from Roblox.
- The optional helper can be controlled by permitted website origins, so allow only sites you trust.
- Localhost binding and request-origin checks reduce certain risks, but they do not protect against malicious software already running on the same computer.

## Reporting a problem

DM `blvxl` on Discord, and do not post exploit details publicly. There is no security audit or guarantee of protection.
