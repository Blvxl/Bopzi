# Security

Bopzi is a local application. Run it only on a trusted computer and bind the server to `127.0.0.1`. The default `npm run dev` and `npm run start` scripts use that address. Do not expose the server or optional helper to the public internet. Do not share `~/.codex/auth.json`, `~/.bopzi`, `.env.local`, or other credentials and private files.

AI generation sends prompts and attached references to OpenAI and uses the locally signed-in Codex session. The optional helper can be controlled by permitted website origins; allow only sites you trust. Localhost binding and request-origin checks reduce certain risks but do not protect against malicious software already running on the same computer.

If you discover a vulnerability, do not post exploit details publicly. A private reporting contact has not yet been established; the project owner should configure one before public release. There is no security audit or guarantee of protection.
