# Polish and smoothness: thumbnail studio and video editor

Research: 18 October 2026. This covers how the editors *feel*: frame pacing, gestures, snapping, motion and small UI problems. It is not about AI features; those are in the 14 and 16 October docs. It is based on reading `src/video/Preview.tsx`, `Timeline.tsx`, `render.ts`, `VideoEditor.tsx`, `src/studio/Studio.tsx`, `CanvasStage.tsx` and `state.ts`, and on using both editors at 1440×900. Frame timing could not be measured live because the browser pane was hidden, which throttles rAF. The playback findings below come from the code.

## Video editor: playback smoothness (biggest wins)

### 1. The preview is limited to about 30 fps
`Preview.tsx:60` paints only when `now - frame >= 30`. On a 60 Hz screen that is every second rAF, so it draws at 30 fps. On 120/144 Hz screens the pacing is uneven. Zoom punches, shakes, titles and captions all animate at 30 fps even when the footage is 60 fps, which Roblox recordings usually are.
**Fix:** paint on every rAF. For the footage, use `requestVideoFrameCallback` to know when a new decoded frame has arrived (supported in Chrome/Edge 83+, Safari 15.4+, Firefox 132+). Animated layers keep drawing on rAF. `understand.ts:135` already uses rVFC.

### 2. Playback re-renders the whole editor 33 times a second
`onTime={setTime}` (VideoEditor.tsx:1226) is called on every paint. Each call re-renders the 1,333-line `VideoEditor` and the full `Timeline`, which runs `packTimelineRows` for every lane, rebuilds every item button, and recomputes the snapping anchors. This is the classic cause of a "slightly sticky" editor, and it competes with video decoding on the main thread.
**Fix:** while playing, keep time in a ref. Move the playhead with `style.transform = translateX(...)` and update the clock text directly through refs. Write `setTime` only on pause or seek, or about 4 times a second for panels that need it (transcript highlight, moments).

### 3. A wall-clock master clock plus corrective seeks causes hitches
Time advances by `performance.now()` deltas (Preview.tsx:58). Each video and audio element is seeked back whenever it drifts more than 0.18 s (lines 82, 106, 118). Each seek is a visible freeze and an audible skip, and drift builds up quickly when decoding stalls.
**Fix:** while a video clip is on screen, use its `currentTime` as the master clock, or use the AudioContext clock. Correct small drift by nudging `playbackRate` by ±2–5 % for a moment. Seek only on a real jump.

### 4. Every cut stalls for a moment
Media elements are keyed by `assetId` (Preview.tsx:40). Two clips from the same file share one `<video>`, which is the normal case after Split followed by deleting the middle. At the cut the element has to seek to the new in-point, and the preview holds the last frame until the seek finishes (the `painted` logic). A cut to a different file starts from a cold element.
**Fix:** double-buffer. Keep a pool of two elements per asset. About 1 s before each cut, seek the idle element to the next clip's in-point and let it decode the first frame. At the boundary, swap which element is drawn. This is what makes cuts feel instant in CapCut. Clipchamp went further and buffers decoded frames with WebCodecs for fast random access ([W3C talk](https://www.w3.org/2021/03/media-production-workshop/talks/soeren-balko-clipchamp-webcodecs.html)), but double-buffering gets most of the benefit with very little code.

### 5. The export is always 30 fps
`render.ts` puts `fps=30` on every clip (lines 52–54), the overlay layers are composited at 30 fps, and transitions and motion blur are timed per 30 fps frame. 60 fps gameplay is halved.
**Fix:** export at 60 fps when the sources are 50 fps or more. Let `cameraExpressions` and `transformExpressions` take the frame rate as a parameter instead of the hard-coded `/30`. Layer frames can stay at 30 fps over 60 fps footage if render time matters, because text motion hides it better than camera motion does.
**Also still open from 16 Oct:** smooth slow-motion with `minterpolate` on clips with speed below 1. This is CapCut's "optical flow", which it pairs with speed curves ([CapCut](https://www.capcut.com/resource/optical-flow-in-capcut)).
**Audio polish:** the export ends with `alimiter` only. Add a `loudnorm` pass (I=-14 for YouTube/Shorts) so every export comes out at the same loudness.

## Video editor: timeline feel

| # | Missing | What good editors do | Where |
|---|---|---|---|
| 6 | **No wheel or pinch zoom.** Zoom is set only by fit-to-width (VideoEditor.tsx:271). | Ctrl+wheel / trackpad pinch zooms **around the pointer**, so the spot under the cursor stays put. Add a zoom slider and a fit button. | `Timeline.tsx` scroller |
| 7 | **The playhead runs off-screen while playing.** Nothing scrolls the track. | It pages ahead (or scrolls smoothly) when the playhead reaches about 85 % of the view. | Same ref-driven loop as #2 |
| 8 | **Clip reordering jumps.** Other clips snap to their new places on release. | FLIP animation: neighbours slide over about 150 ms while you drag, so you see the gap open. | `reorderLine` logic |
| 9 | **Ruler has a label every 5 s and no minor ticks.** | Ticks adapt to zoom (1 s → 0.5 s → frames) and the ruler shows a timecode under the cursor on hover. | `ve-ruler` |
| 10 | **No real audio waveforms** (none found in the code). | Peaks drawn on audio clips, and on the clip track for clips with sound. This is what makes trimming on a sound easy. Compute once with OfflineAudioContext and cache per asset. | `beats.ts` already decodes audio |
| 11 | **Shuttle and trim keys.** Only Space, arrows (fixed 1/30 s) and S. | J/K/L shuttle, `,` `.` step by the source's real frame duration, I/O set the loop, Q/W ripple-trim to the playhead, Home/End jump globally (today they only work while the playhead has focus). | keydown handler, VideoEditor.tsx:320 |
| 12 | **Arrow-key step assumes 30 fps.** | Step by one frame of the clip under the playhead. | same |

## Thumbnail studio: canvas feel

| # | Missing / rough | Fix | Where |
|---|---|---|---|
| 13 | **No wheel/pinch zoom, no zoom to cursor, no Space+drag pan.** Ctrl+wheel did nothing when tried. The +/− buttons step a flat 10 %. | Ctrl/pinch zooms around the pointer. Space-drag and middle-drag pan. Buttons step through 25/33/50/67/100/150/200 %. Animate between Fit and 100 % over about 180 ms instead of jumping. | `CanvasStage.tsx` wrapper, `Studio.tsx:1147` |
| 14 | **Snapping only while moving.** Resize and rotate don't snap. There are no equal-spacing guides and no distance labels. | Snap edges while resizing (Konva `anchorDragBoundFunc`). Show Figma-style pink gap markers when a layer's gap matches a neighbour's ([Figma: distribute, tidy up](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions); [Smart Selection](https://www-figma.fabuza.ru/blog/introducing-smart-selection/)). Show the px distance to the nearest neighbour when Alt is held. | `snap()` CanvasStage.tsx:165 |
| 15 | **No Shift-drag axis lock, and rotation snaps only to 90°.** | Shift locks movement to the x or y axis. Shift while rotating snaps to 15°. | Transformer props |
| 16 | **No marquee select.** Multi-select is only by Shift-clicking. | Drag on empty canvas draws a selection rectangle. | Stage onMouseDown |
| 17 | **The zoom pill overlaps the artboard's bottom-right corner** at 1440×900, and the selection toolbar sits over the top edge. | Reserve that space in the `fit` maths (as `footerSpace` already does for generation), or float the pill outside the artboard. | `CanvasStage.tsx:72–76` |
| 18 | **Autosave hitches.** 700 ms after every change, `save(true)` renders the artboard twice and encodes a JPEG on the main thread. While nudging or typing this happens over and over. | Save the doc on the timer, but render the project-list thumbnail in `requestIdleCallback`, or only when the page is hidden or left, or at most every 10 s. | `Studio.tsx:234` |
| 19 | **Undo doesn't restore selection,** and the change it reverts just teleports. | Store `selectedId` with each history entry. Optionally tween moved layers back over about 120 ms with `node.to()`. Changes then read as "that moved back". | `state.ts` |
| 20 | **Toasts replace each other at once.** A new one cuts off the old one mid-read. | A short queue: stack up to 2, with enter and exit motion. | `Studio.tsx:147` |
| 21 | **Heavy text may drag slowly.** Large titles with stroke, glow and shadow redraw fully on every drag frame. | Check with the profiler. If it is slow, `node.cache()` on dragstart and `clearCache()` on dragend. | `LayerNode.tsx` |

## Shared polish

- **One motion system.** Both editors define their own durations and easings in CSS. A few tokens (`--ease-out`, `--dur-fast 120ms`, `--dur-base 180ms`, `--dur-slow 280ms`) plus one spring for things that land would make the two editors feel like the same product. Reduced-motion handling is already thorough; keep it.
- **Interaction latency budget.** Anything the pointer touches should respond within the same frame: hover states, drag ghosts, the playhead. #2 and #18 are the two places this budget is broken today.

## Suggested order

1. **#1–#4** (preview pacing, no re-render loop, master clock, double-buffered cuts). These make playback feel smooth, and they are the most noticeable for a "smoothness" goal. Effort M in total, all in `Preview.tsx` plus a small change in `VideoEditor.tsx`.
2. **#13 + #17** (canvas zoom/pan and the overlap). Effort S. The thumbnail studio feels like a real design tool straight away.
3. **#6–#7 + #10** (timeline zoom, follow, waveforms). Effort S–M.
4. **#5** (60 fps export, loudnorm). Effort M, mostly parameterising `/30`.
5. **#14–#16, #18–#20** (snapping depth, marquee, autosave hitch, undo selection, toasts). Effort S each.

## Sources

- [web.dev: requestVideoFrameCallback](https://web.dev/articles/requestvideoframecallback-rvfc), [MDN: requestVideoFrameCallback](https://developer.mozilla.org/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback): callbacks fire at the lower of the video and display rates; `presentedFrames` shows dropped frames.
- [W3C workshop: Clipchamp and WebCodecs](https://www.w3.org/2021/03/media-production-workshop/talks/soeren-balko-clipchamp-webcodecs.html), [W3C: browser-hosted video editing](https://w3.org/2021/03/media-production-workshop/talks/james-pearce-browser-hosted-video-editing.html): buffering decoded frames ahead of the playhead for fast seeking and splicing.
- [Chrome: WebCodecs](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs?hl=it): a `VideoFrame` can be passed straight to `drawImage`.
- [Figma help: alignment, distribute, tidy up](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions), [Figma Smart Selection (mirror)](https://www-figma.fabuza.ru/blog/introducing-smart-selection/).
- [CapCut: optical flow](https://www.capcut.com/resource/optical-flow-in-capcut).
- No authoritative 2026 Roblox thumbnail guidance turned up (the official docs URL tried returned 404), so nothing here depends on it.

Only this document was added; application code was not changed.
