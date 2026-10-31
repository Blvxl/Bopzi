# Bopzi helper

The helper is an optional local bridge for a Bopzi page that cannot access the local server directly. For normal local development, follow the [main setup](../README.md); a separate helper is not required.

It requires Node.js 20.9 or newer and a working Codex installation signed in with a ChatGPT account with access to the required features. From the project root:

```sh
npm run helper
```

The helper listens on `127.0.0.1:47615` and accepts requests from `http://localhost:3000` by default. To allow a different Bopzi origin, run `node helper/bopzi-helper.mjs --origin https://your-bopzi-site.example`. Only allow an origin you trust: that site can request actions using your local connection. Leave the helper running while using it.

The image path reads the local Codex authentication file server-side and sends the relevant account credentials, prompt and reference images to OpenAI's Codex image backend. It does not send credentials to browser code. This backend is undocumented and may change; account eligibility and usage limits apply. See [the integration notes](../docs/chatgpt-integration.md). Set `BOPZI_CODEX` to the executable's full path if Codex cannot be found. macOS and Linux discovery paths have not been fully tested.
