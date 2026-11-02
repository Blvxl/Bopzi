# Authorized contributions to Bopzi

Bopzi is a private proprietary project. Changes are accepted only from collaborators authorized by the owner under separate written terms. Public pull requests and unsolicited contributions are not accepted. Repository access by itself does not grant permission to use or redistribute the software.

Windows is the primary development environment. See [README.md](README.md) for project setup and product context.

## Development

Install dependencies with `npm ci` and run `npm run dev -- --hostname 127.0.0.1`. Keep the server on a trusted local machine: it can access local media and the local Codex session. Do not commit credentials, personal media, local project data, generated builds or `.env.local`.

Before submitting a change, run `npm run typecheck`, `npm run build`, and the relevant tests under `tests/` with `node --test`. Video integration tests need FFmpeg and FFprobe; describe any checks you could not run. For UI changes, include a screenshot or brief reproduction steps when useful.

Next.js documentation bundled in `node_modules/next/dist/docs/` describes the version used by this project. Preserve existing functionality and explain behavior changes and platform limitations in the change description.

## Reporting issues

Describe what you expected, what happened, the steps to reproduce it, your operating system and architecture, Node version, and any relevant logs. Remove credentials, private prompts, media and personal paths before sharing. For a suspected security issue, avoid publishing exploit details until a private reporting channel is available.

Before work begins, agree in writing on contribution ownership and licensing with the owner. Include provenance and licensing information for any new third-party assets or dependencies. See [LICENSE](LICENSE) for the current proprietary notice.
