# What Fosia does that Bopzi Video doesn't yet

Research: 16 October 2026. Fosia ([fosia.ai](https://fosia.ai/)) is an AI chat plugin for Premiere Pro aimed at gaming and short-form creators. It is waitlist-only, so it could not be tried. Its homepage plays five demo videos, and each has the exact request typed into its chat box (taken from the page source). I sampled those videos frame by frame to see how each effect really moves, not just what the marketing says. This is a comparison against the Bopzi code as it is today. That code now includes the second video layer, follow labels, text behind the subject and progress bars from the two follow-up sessions.

## Fosia's eight demo requests and what the frames show

| Request typed in Fosia | What the frames show | Bopzi today |
|---|---|---|
| "add a zoom and a white flash onto the driver's helmet. Add text 'FORMULA 1 DRIVER' on the right of the helmet" | The **flash is only on the helmet**: its own shape goes white for about 0.2 s (5.2–5.4 s) while the rest of the frame stays normal. Then an eased push-in **keeps the helmet framed as it moves**. The text **sits in the scene**: it grows with the zoom and moves with the helmet. | Flash is full-frame only. Zoom aims at a fixed x/y (`ZoomEffect`), so it doesn't follow. Follow labels move with an object but stay screen-sized and ignore the camera zoom. |
| "I want captions as well as a red flash on my gun when I say 'gun'" | Plain word captions. The gun alone turns red the moment "gun" is said (8.16 s) and **fades out smoothly over about 0.6 s**. | Now possible: the AI gets word timings (stage 1) and a tinted highlight. The fade, though, is the highlight's general reveal, not a flash curve. |
| "Replicate this [attached screenshot], but give it a dark theme and change the name to 'Hugo Karlsson'" | A **stats card** (name header plus Weight / Body fat / Age / Height rows) beside the athlete. It opens downward, **rows appear one after another**, it holds, then fades out (3.9–5.2 s). | No card or panel layer. An attached image can only be imported as media; the AI can't rebuild it as editable graphics. |
| "Now add a DAY 0 to 30 counter on the top left corner" | A counter in the corner. | ✓ counters with prefix and position. |
| "Now make the barbell have a green tint that turns amber after 1 sec, for about 0.5 secs" | The tint on the tracked object **changes colour over time**. | A highlight has one colour; the AI would need two highlights and a second trace. |
| "make penguins flash green once from top to bottom, and make a thermometer drop down from the top of the screen showing cold temperatures; move it back up at the end" | **Several objects flash one after another** in screen order. A **gauge graphic** drops in, its number falls (0 → −19 → −40°), then it rises out. | One highlight is one traced object. Nothing picks all penguins and staggers them. Progress bar exists, but there's no gauge or drop-in/out motion. |
| "Float text 'Your imagination, straight on the timeline' above the football" | Text stays above the rolling ball. | ✓ follow labels (new). |
| "Now add a light sweep across the ball every 1 sec" | A **light sweep repeats across the ball's own shape** every second. | No sweep or shine effect; there's no "repeat every N seconds" either. |

Two smaller things from the demo UI:
- Fosia's chat box has a **paperclip for references** and a **select-region tool** (square icon), so the user can point at a part of the frame.
- The selection pill reads "2 clips", so **several clips** can be the context at once. Bopzi takes one.

## What actually makes it look smooth

The frames show four things, and Bopzi lacks the first three:

1. **Effects live on the object, not on the screen.** Flash, tint, sweep and zoom are all clipped to the traced shape, or follow it. Bopzi already traces objects (`track.ts`), but only highlights, labels, bars and text-behind use the trace. The camera and flashes don't.
2. **Tracking without jitter.** A zoom that follows a box jitters by a few pixels per frame unless the path is smoothed. `trackedPoint` in `follow.ts` only blends linearly between traced frames, which is fine for a label but would shake a zoomed camera visibly.
3. **Motion in sequence, not all at once.** Rows come in one after another, penguins flash in order, the card opens then holds then closes. Bopzi's presets animate a whole layer as one piece.
4. **Short, eased timing.** Flashes last 0.2–0.6 s with a fast attack and a slow decay; entrances take about 0.3 s. Bopzi's easing library already covers this.

## Suggestions, in priority order

### 1. Tracked camera zoom
Add `follow?: highlightId` to `ZoomEffect` (`motion.ts`). The camera centre then comes from the traced box at each moment instead of a fixed x/y, smoothed with a critically damped spring or a one-euro filter so it doesn't jitter. Both the preview (`cameraAt`) and the export (`cameraExpressions`) need it. The export would have to receive the smoothed path as keyframes, because FFmpeg can't read masks. Bake it into piecewise-linear `perspective` expressions sampled at 15–30 fps.
Prompt: "zoom on the helmet" → trace the helmet and zoom with follow.
*Most visible "Fosia" effect, and Bopzi already has the tracer. Effort M.*

### 2. Object flash, colour change and light sweep (highlight looks)
New highlight looks on the existing traced shape:
- **flash**: peaks at full colour within 0.05 s and decays over the duration with an ease-out. This is the gun and helmet effect.
- **colour change**: a list of colours at times, e.g. green then amber at +1 s, blended.
- **sweep**: a bright diagonal band crossing the shape, repeating every `every` seconds.
These are all drawn in `layers.ts` from the existing mask, so the export gets them for free (layers are rendered in the browser).
*Effort S–M. Covers three of Fosia's eight demos.*

### 3. In-scene layers
A `scene: true` option on titles, overlays and follow labels: they get the footage's camera transform (zoom, shake, transitions), so they grow and move with a zoom like "FORMULA 1 DRIVER". In the preview, draw them in `drawFootage`'s transform. In the export, they need to be rendered into the per-frame layer images using the same camera maths (`cameraAt`). *Effort M.*

### 4. Card and gauge motion graphics, rebuilt from a screenshot
- **Card**: a layer with a header (icon, title) and up to 8 label/value rows, plus theme colours, corner radius and blur-behind. It animates by expanding downward and revealing rows one after another, holds, then exits. It can follow an object.
- **Gauge**: a vertical or horizontal meter with a counter that drops or slides in and back out, built from the existing bar and counter logic.
- **Screenshot → card**: when the user attaches an image as a *reference* (not media), the AI fills in the card's rows, colours and fonts from it. Codex can already see images.
This is the "DAY 30 challenge" and stats-overlay format that Roblox creators also use (player stats, item stats, upgrade cards). *Effort L, high value.*

### 5. Several objects at once, staggered
"Flash every penguin top to bottom" or "highlight every player":
- The editor's segmenter (`segment.worker.ts`) finds every instance of the object inside a box or the whole frame, from one click or the AI's boxes.
- The AI step creates one highlight per object and sets their starts in an `order` (top-to-bottom, left-to-right, by size) with a `stagger` gap.
- Tracing then runs for each highlight, as today.
*Effort M. Today the AI would have to guess every box itself.*

### 6. Point at it: a region tool and reference attachments in the prompt
- A square button in the composer: drag a box on the preview, and the request carries "the user means this box: x, y, w, h at 4.2 s". That removes the AI's biggest guess, finding the object, and makes tracking start on the right thing.
- A paperclip "use as reference" mode sends the image to the AI without adding it to the project. It's needed for item 4.
- Selecting several clips gives several clips as context ("2 clips").
*Effort S each.*

### 7. Smooth slow motion
This is the other kind of "smooth" that creators ask for. At 0.25× speed, 30 fps gameplay stutters, because each frame is shown four times. Add **frame interpolation** to clips with speed below 1 (or to speed-ramp sections):
- Export: FFmpeg `minterpolate=fps=60:mi_mode=mci` on those segments. It's slow, so make it opt-in ("Smooth slow-mo").
- Preview: blend neighbouring frames as an approximation.
CapCut sells this as "smooth slow-mo"; it's what makes velocity edits look professional. Check render time on long clips first. *Effort M.*

### 8. Repeat and every-time
- `repeat: { every, until }` on effects for "every 1 sec" (sweep, pulse, shake on every beat).
- An AI helper rule: "every time I say X" → one effect per matching word in the transcript. The AI can do this today, but a deterministic expansion avoids missed words.
*Effort S.*

## Suggested first build

Items **1 + 2**: a tracked zoom with smoothing, plus flash, colour-change and sweep looks on traced objects. Together they reproduce four of Fosia's eight demos (helmet zoom and flash, gun flash, barbell colour change, ball sweep) on top of tracing Bopzi already has. Then **6** (point-at-it), because it makes every tracked effect start on the right object. Then **4** (cards), the biggest new format.

## Caveats

- Fosia was not usable (waitlist), and its demos are curated marketing clips. We don't know how reliable its tracking is on hard gameplay, how fast it is, or what it costs.
- Fosia edits inside Premiere, so it borrows Premiere's renderer, masks and tracking. Bopzi has to build each of these into its own preview and export, and keep the two matching.
- Frame observations come from sampled stills at 0.06–0.6 s spacing, so exact timings are approximate.

## Sources

- [fosia.ai](https://fosia.ai/): homepage, its demo prompt list in the page source, and five demo videos on media.fosia.ai.
- Bopzi code: `src/video/motion.ts` (`ZoomEffect`, `BarEffect`), `follow.ts` (`trackedPoint`), `model.ts` (`Title.follow` / `behind`, `videoOverlays`), `track.ts`, `layers.ts`, `render.ts`.
