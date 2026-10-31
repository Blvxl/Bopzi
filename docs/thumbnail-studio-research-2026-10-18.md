# Thumbnail studio: what to improve, polish and add

Research: 18 October 2026. Thumbnail studio only (`src/studio`, `src/lib/thumbnail`). It is based on reading `Studio.tsx`, `CanvasStage.tsx`, `LayerNode.tsx`, `Composer.tsx`, `Inspector.tsx`, `SimpleTools.tsx`, `GenerationStatus.tsx`, `RobloxPreview.tsx`, `state.ts` and `cutout.worker.ts`, plus using the studio at 1440×900 and outside research. The video-editor findings from today stay in [polish-smoothness-research-2026-10-18.md](polish-smoothness-research-2026-10-18.md) for later; the thumbnail rows there are repeated and extended here.

**What is already strong:** the Roblox preview measured from roblox.com, Arrange with three reviewed takes, concepts with version history, the test-set export under 3 MB, protected originals, in-browser background removal, the kit, and careful reduced-motion handling. The gaps below are about speed of iteration, text, and feel.

---

## A. Features that would move the needle most

### A1. Several concepts per Generate, and "test variants"
Today one Generate makes one image and takes "a minute or two" (`GenerationStatus.tsx`). Roblox's own system wants **2–5 active thumbnails**. It splits traffic, then gives more impressions to the winner per user group, judged on qualified play-through rate (qPTR). Roblox reports +8.5 % qPTR on average and up to +50 % for some games ([Roblox docs](https://create.roblox.com/docs/production/publishing/thumbnails)).
- **Generate 3 at once**, as Thumbmagic and Pikzels do ([vidocu](https://vidocu.ai/blog/6-best-ai-youtube-thumbnail-generators-2026), [codingem](https://www.codingem.com/best-ai-thumbnail-generators/)). Each lands as its own concept, so Compare and Test set work straight away.
- **"Make a test variant" on a concept:** change **one** thing only (expression, title colour, camera angle, or hook: danger, reward, progress). Testing guides warn that changing several things at once means you learn nothing ([Game Idea Lab](https://gameidealab.com/guides/how-to-test-roblox-thumbnails)). Bopzi already has the controls (`EXPRESSIONS`, `HOOKS` in `Composer.tsx`) and the refine path. This is mostly UI.

### A2. Send the test set straight to Roblox
Since August 2026, Open Cloud has a **thumbnail personalization API**. It can upload, update and delete Home-page thumbnails and change targeting rules (`POST …/thumbnail-personalization-api/v1/universes/{id}/thumbnails/uploads`, authenticated with an `x-api-key`) ([DevForum announcement](https://devforum.roblox.com/t/new-opencloud-apis-for-analytics-events-experiments-and-thumbnail-personalization/4828676)). Bopzi could replace "Download 2–5 files, then upload them in Creator Hub" with **one button**. Caveats: the docs are incomplete. A commenter says writes need the `universe.thumbnail:write` scope and can silently do nothing without it. The announcement doesn't mention reading qPTR back. Treat this as a spike before promising it.

### A3. The text Roblox thumbnails actually use
Text supports a fill (with a two-colour fade or rainbow), two outlines, a plate, a shadow, a glow and an arc curve. That's good, but the signature Roblox look also needs:
- **3D extrude (depth):** the letters repeated N times, each offset by 1 px down and to the side in a darker shade, under the face. It's cheap to draw (the second-outline trick already stacks copies) and is the most recognisable style in the genre.
- **Bevel / inner shine:** a lighter band on the top half of the fill (a gradient clipped to the glyphs).
- **Per-word styling:** one word bigger or another colour ("I got **1,000,000** Robux"). Today a layer has one colour and one size.
- **More warps than an arc:** Kittl offers arch, wave, rise, flag, circle, angle and mesh, each with a slider ([Kittl](https://www.kittl.com/feature/text-layouts)). For Roblox titles, *rise* (one end bigger), *perspective* and *wave* are the useful ones.
- **More presets:** there are 5 today (`factory.ts`: Chunky pop, Gold block, Strike, Dread, Clean). Add per-genre ones (simulator, obby, tycoon, horror, anime, update/event) built from the effects above.

### A4. A readability check that runs by itself
Roblox says to keep essential content away from the bottom, because metadata covers it ([docs](https://create.roblox.com/docs/production/publishing/thumbnails)). Testing guides say to check at phone size before anything else. Bopzi has the Safe area guide and the preview, but both have to be opened. Add a quiet check after each edit, shown as a small badge near Download:
- text whose letters would be under ~10 px tall on the Home tile (the preview already knows the tile size);
- low contrast between text and what is behind it (sample the pixels under the text box);
- anything important in the bottom band.
Clicking the badge flashes the problem layer. Arrange already computes `readable` and `issues` per take; this reuses that logic on the user's own layout.

### A5. Better image controls
- **Adjust** has only blur, brightness and saturation (`Inspector.tsx: ImageLook`). Add **contrast, vibrance, warmth, sharpen and vignette**, plus a one-click **"Pop"** (more contrast and saturation, a light vignette) for screenshots. These are all canvas `filter` values or simple passes in `prepare()`.
- **Edit only one area** is a feathered rectangle (`keepOutside` in `Composer.tsx`). Add a **brush or lasso mask**, so "change his sword" doesn't also change the arm next to it.
- **Subject-aware tools on the generated image:** cut the character out of the AI image (the cutout already runs in the browser) so it can be moved or scaled separately from the background. Also add "make the character bigger" without regenerating.

### A6. Generation flow
- The composer is **locked for the whole wait** (`busy`). Let people keep working (type the next edit, queue a variant), and show the result when it arrives.
- Replace "This can take a minute or two" with **this machine's own typical time** (the median of the last few runs, stored locally). A known wait feels shorter.
- Compare shows only the **latest four** concepts. Allow picking any concepts, with a phone-size row under the large tiles.

---

## B. Canvas feel and smoothness

| # | Today | Fix | Where |
|---|---|---|---|
| B1 | **No Ctrl+wheel or pinch zoom, no zoom to the pointer, no Space+drag pan.** Scrollbars are hidden (`scrollbar-width:none`), so at 100 %+ the only way to move is the scroll wheel. The +/− buttons step a flat 10 %. | Ctrl/pinch zooms around the pointer. Space-drag and middle-drag pan. Steps go 25/33/50/67/100/150/200 %. Add Shift 1 to fit and Shift 0 for 100 % (Figma's keys; Ctrl 1 is taken by the browser). | `CanvasStage.tsx`, `Studio.tsx` |
| B2 | **The zoom pill covers the artboard.** Measured at 1440×900: artboard to x 1200 / y 712, pill from x 1166 / y 690, so 34 × 22 px of the corner is hidden. | Reserve the pill's height in the fit maths (as `footerSpace` already does during generation). | `CanvasStage.tsx:72–76` |
| B3 | **Snapping works only while moving.** Resizing and rotating don't snap. There are no equal-gap guides and no distance labels. | Snap edges while resizing (Konva `anchorDragBoundFunc`). Show Figma-style gap markers when spacing matches a neighbour ([Figma help](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions)). Show distances to neighbours while Alt is held. | `snap()` CanvasStage.tsx:165 |
| B4 | **No Shift axis lock. Rotation snaps only to 90°.** | Shift-drag moves in a straight line. Shift-rotate snaps in 15° steps. | Transformer, `snap()` |
| B5 | **No marquee select.** Multi-select is only by Shift-clicking. | Drag from empty space to box-select. A full-canvas background is only picked if fully enclosed, so it doesn't join every box. | Stage `onMouseDown` |
| B6 | **Autosave hitch.** 700 ms after each change, it redraws the artboard twice and encodes a JPEG on the main thread (`save(true)`, Studio.tsx:234). This repeats while nudging or typing. | Save the document on the timer. Make the project-list thumbnail in `requestIdleCallback`, at most every ~10 s, and when the tab is hidden. | `Studio.tsx` |
| B7 | **Image sliders recompute at full size.** Every tick of Blur, Brightness, Colour, Crop or Outline re-runs `prepare()` on the full-resolution picture. An outline draws the whole image 32 times (`OUTLINE_STEPS`). On a 1920 px background this probably drags; it was not timed here. | While a slider is moving, prepare at screen resolution, then do the full-size pass once on release. Or move `prepare` to a worker with `OffscreenCanvas`. | `LayerNode.tsx:59–111` |
| B8 | **Undo doesn't select what it changed,** and moved layers jump. | Select the layer the undo touched (reference-compare the two docs in `state.ts`). Optionally tween it back over about 120 ms. | `state.ts` |
| B9 | **Toasts replace each other at once.** A warning can vanish under the next "Saved" message. | A short queue (up to 2 stacked) with enter and exit motion. Warnings outrank confirmations. | `Studio.tsx:147` |
| B10 | **Heavy titles may drag slowly.** Each text layer draws once per effect pass (shadow, glow ×3, second outline). | If profiling confirms it, `cache()` the node on drag start and `clearCache()` on drag end. | `LayerNode.tsx` |

---

## C. Smaller polish
- **Undo has no "what was undone" label** in the studio (the video editor names its steps). A quiet "Undid: Move Title" toast helps with fast Ctrl Z presses.
- **Selection toolbar** sits over the artboard's top edge when a layer is near the top. Flip it below the selection when there isn't room.
- **Projects list thumbnail** is regenerated with every save (B6). Once that's idle-only, also show "edited 2 min ago" on the card.
- **Single PNG export** is always a full PNG. Offer "Roblox-ready (under 3 MB)" for the single image too, reusing the test-set logic.

## Suggested order
1. **B1 + B2 + B6 + B7**: zoom/pan, the overlap, and the two main-thread hitches. Effort S–M. This is what "smooth" means in an editor.
2. **A1**: several concepts per Generate and one-variable test variants. Effort M. The biggest product win, and it suits how Roblox's personalization works.
3. **A3**: extrude, bevel, per-word style and genre presets. Effort M. These are what Roblox thumbnail text needs.
4. **A4**: readability badge. Effort S–M, reusing Arrange's checks.
5. **B3–B5, B8, B9**, then **A5, A6**.
6. **A2** as a spike: upload the test set to Roblox through Open Cloud.

## Sources
- [Roblox Creator Docs: Thumbnails](https://create.roblox.com/docs/production/publishing/thumbnails) ([source on GitHub](https://github.com/Roblox/creator-docs/blob/main/content/en-us/production/publishing/thumbnails.md)): 16:9, 1920×1080, under 3 MB, 2–5 active, qPTR, +8.5 % / +50 %, keep the bottom clear.
- [DevForum: Open Cloud thumbnail personalization API](https://devforum.roblox.com/t/new-opencloud-apis-for-analytics-events-experiments-and-thumbnail-personalization/4828676) and [Personalize your thumbnails](https://devforum.roblox.com/t/live-now-personalize-your-thumbnails-to-attract-more-users/3257233).
- [Game Idea Lab: how to test Roblox thumbnails](https://gameidealab.com/guides/how-to-test-roblox-thumbnails): one variable per test; start with danger / reward / progress; judge at phone size.
- [vidocu: AI thumbnail generators 2026](https://vidocu.ai/blog/6-best-ai-youtube-thumbnail-generators-2026), [codingem](https://www.codingem.com/best-ai-thumbnail-generators/), [Pikzels review](https://blogginglift.com/pikzels-ai-review/): multiple variants per run, recreating a layout, a persona or face, built-in scoring.
- [Kittl text layouts](https://www.kittl.com/feature/text-layouts), [Kittl 3D lettering](https://kittl.com/article/how-to-easily-make-3d-lettering-effects): warp styles and 3D or bevel text driven by sliders.
- [Figma: align, distribute, tidy up](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions).
- [DevForum: beginner's guide on GFX](https://devforum.roblox.com/t/beginners-guide-on-gfx-2024/3119571).

Only this document was added. Application code is unchanged (an early start on B1/B2 was reverted).
