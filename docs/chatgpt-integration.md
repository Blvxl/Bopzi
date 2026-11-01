# ChatGPT subscription image generation

Verified on this computer on 11 October 2026: a direct subscription request returned an image, and the Bopzi Create panel generated a second image, added it to the canvas, saved the project and exported a 1920 × 1080 PNG.

## Use

1. Sign in to Codex with your ChatGPT account on this computer.
2. Run `npm run dev` and open `http://localhost:3000/studio`.
3. In Create, describe the game action, choose a style and optionally add a title or up to two game/character images, plus one separate style reference. Choose a real game thumbnail from Find inspiration or upload a style image.
4. Click Generate thumbnail. The image appears on the canvas. Add editable text or uploads if needed, then Download PNG.

Dark mode is the default. The header theme button switches themes and remembers the preference. Layouts, Advanced mode and the manual copy/open-ChatGPT workflow have been removed from the studio.

## Connection

The server reads the existing `~/.codex/auth.json` ChatGPT session for each request. It never sends access tokens to browser code, copies them into the project, handles a password or manages a separate OAuth registration. If the session expires, reconnect in Codex and refresh the connection status in Bopzi.

Image generation now calls Codex's native subscription-backed Images endpoint directly: `https://chatgpt.com/backend-api/codex/images/generations`; requests with identity/style inputs use `/edits`. It uses the signed-in account header and asks for `gpt-image-2.5-sunburst`, moving on to `gpt-image-2` if the backend ever refuses the first (as of 2026-11-01 it accepts any model name, even a made-up one, so which model actually runs is not confirmed), requests 1536 × 864 for landscape thumbnails and 1024 × 1024 for square images, and consumes the returned base64 image directly. Scene questions are still interpreted by Codex before generation; look-only references remain excluded from image inputs. This removes the unreliable second step where a model was asked to invoke a tool and save its result to disk.

Protocol source: the [official Codex Images client](https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/endpoint/images.rs) calls `images/generations` and `images/edits`, and the [official request types](https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/images.rs) define the image input and base64 response shape. The ChatGPT backend URL itself is an undocumented Codex endpoint and may change.

This endpoint is undocumented and may change. This is different from the official Sign in with ChatGPT API token-sharing preview, whose [limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) exclude image generation. The earlier text-only connection used that preview; it is no longer the studio workflow.

Generation uses the account's subscription allowances. No Platform API key or separate Platform billing is configured. Access depends on the account and backend entitlement. Text-to-image and reference-image generation have both been verified end to end. The library-reference test used Barry's Prison Run for style and generated an original lava-obby scene without copying its police character or prison setting.

## Local containment and data

- Only loopback hostnames are accepted. Production is disabled unless `BOPZI_LOCAL_CHATGPT=1` is set; loopback restrictions still apply.
- POST requests require Bopzi's custom header and matching Origin. Foreign-origin and malformed requests are rejected.
- A server instance allows one generation at a time. Requests time out after five minutes. Generation is not automatically retried, so a transient error can be retried by the user.
- The brief and optional reference images go to OpenAI. Generated images and project layers are saved in browser IndexedDB.
- The generated 1536 × 864 output is resized to 1920 × 1080 without changing its aspect ratio. This is upscaling, not native 1080p generation.
- A generated image is one flattened layer. Existing layers are hidden, retained in the project and recoverable through Layers or Undo during the current editing session. Undo history does not survive reloading.
- References can change in AI output. Upload an original as its own protected layer when exact asset preservation matters. Generated lettering is baked in; leave Title blank for editable lettering.

## Files

- `src/lib/thumbnail/server.ts`: native-session read, image prompt, subscription request.
- `src/app/api/thumbnail/route.ts`: local status and validated generation route.
- `src/studio/PromptBuilder.tsx`: Create panel, references, progress and canvas import.
- `src/studio/Studio.tsx`: theme persistence, document import and unified editing workspace.

Prompt direction follows [OpenAI's image prompting guide](https://developers.openai.com/api/docs/guides/image-prompting): specific action, framing, identity references and lighting. Export and safe-area decisions follow [Roblox's thumbnail guidance](https://create.roblox.com/docs/production/publishing/thumbnails): 16:9, relevant gameplay and attention to metadata covering the bottom of the image.


## Reference-guided Roblox GFX (11 October 2026)

- Roblox GFX is the new default. Older stored generic/cinematic selections render as GFX in the Create panel. Horror and Vibrant remain explicit options.
- Gameplay, near-miss, reward and contrast hooks change the composition instruction. They never authorise inventing game mechanics or rewards absent from the brief.
- src/lib/thumbnail/references.ts curates 22 game IDs, fetches current metadata and landscape thumbnails from Roblox public APIs and caches them for one hour. Unavailable images are omitted. This is not a CTR ranking or an automatic chart scraper. A stale cache is retained temporarily on upstream failure; the displayed refresh date reflects its actual age.
- The selected library ID is stored with the project. User-uploaded identity/style references currently last for the open editing session and must be reselected after a reload.
- Generation sends game/character images first, then exactly one style image. Prompt labels explicitly distinguish identity from style and forbid borrowing another game's map, logo, characters or event badges. The model may still vary details; review the result.
- Library downloads only use allowlisted game IDs and HTTPS Roblox CDN hosts, reject redirects and detect PNG/JPEG/WebP from image bytes. Roblox sometimes sends valid PNG bytes with a generic binary content-type.
- src/lib/thumbnail/prompt.ts owns prompting and request validation; src/studio/ReferenceBrowser.tsx provides search, genre filtering and source links.
- Tests: node --test tests/thumbnail-prompt.test.cjs checks image-role order, style-only classification, invalid requests, legacy briefs, CDN URL restrictions and image byte detection.
- Live checks: selecting Barry's Prison Run as style inspiration, generating through the subscription edits endpoint, importing the result, saved selection/hook persistence, 1920 x 1080 export, library search/filtering and Escape dismissal.

Useful external references: [Roblox thumbnails](https://create.roblox.com/docs/production/publishing/thumbnails), [OpenAI image prompting](https://developers.openai.com/api/docs/guides/image-prompting). Actual click/qualified-play performance requires tests in the game's Roblox dashboard; Bopzi does not infer CTR from game popularity.

## Visible generation and combined inputs

The canvas shows generation status, an indeterminate activity bar and elapsed time. Status follows actual request/import phases, with no invented percentage or completion estimate. It stays visible when switching tools, replaces the empty-canvas message and clears on success or failure. Motion respects reduced-motion preferences. The request is not resumed after a page reload; keep the project open.

Find/Change inspiration selects the style reference. Add your image adds up to two identity images without replacing that inspiration. Upload your own style instead is inside the reference library and explicitly replaces only the style image. Identity images remain when switching between library and custom inspiration.

Verified live: one request containing the uploaded demo character plus Barry's Prison Run inspiration completed, preserved the blue/green/yellow character direction and imported its result. Both previews remained selected. Switching to Text during generation retained the canvas status; selecting custom style and then returning to a library reference retained the identity upload. Production build and six validation tests passed.

Loading design references: [Material indeterminate progress](https://material-web.dev/components/progress/) and [NN/g on waits and interruptions](https://www.nngroup.com/articles/designing-for-waits-and-interruptions/).
