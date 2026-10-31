# Archived open-source release checklist

Archived notes from the earlier public MIT release. Bopzi is now private and proprietary; this checklist is historical only and is not approval to publish another source release. The current notice is in [LICENSE](../LICENSE). Previously granted MIT rights for earlier copies are not revoked.

- [ ] Create a Git repository and inspect the exact staged file list and diffs before publishing. This working directory was not a Git repository during the initial preparation.
- [ ] Review all included assets and their provenance, including demo/showcase images, fonts and sound files. Built-in sound credits appear in `src/video/sounds.ts`; verify the actual files and their terms. MIT covers Bopzi code, not automatically every dependency or asset.
- [x] Review documents for private information and obsolete personal plans (the four known files were moved to the ignored `backups/` folder on 31 October 2026; re-check the rest of `docs/` before publishing). Local research, backups, build output and screenshot artifacts are excluded by `.gitignore`, but ignore rules do not remove files already tracked in Git.
- [ ] Test a clean `npm ci` and first run on a separate Windows machine, including an account without Codex, FFmpeg installation, and the desired x64 and ARM64 targets. Other operating systems are unverified.
- [ ] Replace or supplement the undocumented local Codex image backend with a documented provider integration if broad, stable public use is a goal. Do not expose the local server as a public multi-user service.
- [ ] Review installer contents, bundled FFmpeg license obligations and signing. Packaging currently targets Windows ARM64 and may copy binaries from the build machine.
- [ ] Resolve the moderate development-dependency advisories in the Electron packaging tree when a compatible fix is available; do not blindly apply a breaking audit fix. As of this preparation, `npm audit --omit=dev` reported no vulnerabilities.
- [ ] Investigate Next.js standalone-build tracing warnings and inspect every packaged file for unintended local contents before sharing an installer.
- [ ] Establish issue reporting and a private security contact once the public repository and maintainers are known.
