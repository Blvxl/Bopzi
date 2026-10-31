# Contributing to Bopzi

Thanks for helping improve Bopzi! Start with the setup instructions in [README.md](README.md). Windows is the primary development environment; platform-specific fixes and testing are welcome.

## Development

Install dependencies with `npm ci` and run `npm run dev -- --hostname 127.0.0.1`. Keep the server on a trusted local machine: it can access local media and the local Codex session. Do not commit credentials, personal media, local project data, generated builds or `.env.local`.

Before submitting a change, run `npm run typecheck`, `npm run build`, and the relevant tests under `tests/` with `node --test`. Video integration tests need FFmpeg and FFprobe; describe any checks you could not run. For UI changes, include a screenshot or brief reproduction steps when useful.

Next.js documentation bundled in `node_modules/next/dist/docs/` describes the version used by this project. Preserve existing functionality and explain behavior changes and platform limitations in the change description.

## Reporting issues

Describe what you expected, what happened, the steps to reproduce it, your operating system and architecture, Node version, and any relevant logs. Remove credentials, private prompts, media and personal paths before sharing. For a suspected security issue, avoid publishing exploit details until a private reporting channel is available.

Contributions are accepted under the project's [MIT License](LICENSE). Include provenance and licensing information for any new third-party assets or dependencies.
