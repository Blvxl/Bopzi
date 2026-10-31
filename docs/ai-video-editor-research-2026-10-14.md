# AI editing research for Bopzi Video

Research date: 14 October 2026. Focus: Roblox gameplay edits, trailers, Shorts and developer workflows.

## Recommendation

Build a motion-capable gameplay editor that AI can operate precisely. The immediate investment should be an animation model and a frame-based compositor, followed by better footage/audio understanding and Roblox-specific editing recipes. The present chat-to-timeline implementation is a useful rough-cut foundation but cannot express much of the motion required for polished edits.

This is a survey of 32 relevant products and enabling tools, plus a short watchlist. It is not an exhaustive inventory of every product marketed as an AI editor. Evidence is public first-party product pages, documentation and repositories, rather than hands-on comparative testing. Vendor feature claims establish what to test, not proof of output quality. Product availability and licenses can change. Costs were not compared because capability and workflow fit are the decision here.

## Closest conversational timeline editors

| Product | Publicly documented direction | Relevance to Bopzi | Evidence / caveat |
|---|---|---|---|
| 1. [Fosia](https://fosia.ai/) | AI assistant inside Premiere Pro. | Chat beside a real editor, inheriting the host's tools. | Homepage advertises a waitlist and says macOS is coming soon. It provides too little accessible detail to establish arbitrary counter/keyframe support or output quality. |
| 2. [Agent28](https://www.agent-28.com/) | Conversational cuts, overlays, captions, pacing and motion graphics on an editable timeline; visual/audio library search. | One of the closest UX references: direct, review, then adjust by hand. | Public beta; Mac downloads listed and Windows marked coming soon when checked. Claims need testing on gameplay, not only talking-head examples. |
| 3. [Kaestral](https://www.kaestral.com/) | Windows editor with tool-driven AI, keyframes/easing, frame inspection, audio analysis, local transcription and motion graphics, including counters. | A particularly relevant architecture reference for explicit editing operations and motion primitives. | Its [repository](https://github.com/prabindersinghh/Kaestral-pro) identifies GPL-3.0. Documentation and demos are first-party claims; no benchmark run here. Do not assume model inference is local merely because media processing is described as local. |
| 4. [Palmier Pro](https://github.com/palmier-io/palmier-pro) | macOS editor exposing its timeline to agents through MCP, with an in-app agent and generation tools. | Study how an agent and human share one project and inspector. | Requires Apple Silicon/macOS 26 per the repository. Historical source through v0.7.6 remains GPLv3; later binaries are proprietary. Do not describe current releases as wholly open source. |
| 5. [VedPilot](https://vedpilot.com/) | Chat edits on a multitrack timeline with keyframes, masks, effects, animated captions, Lottie and frame-based animation tools. | Strong reference for combining manual editing, AI actions and editable animated elements. | The website labels some previews illustrative. The breadth of its marketing is not independent proof that all complex instructions work. |
| 6. [Framedeck](https://framedeck.ai/) | Prompt edits become validated editor actions; footage analysis, word captions, motion design and Remotion rendering. | Useful architecture reference for analysis → validated edits → composition → render. | [Public repository](https://github.com/kevinrss01/framedeck). Review the actual license files and dependency terms before reuse; no production-readiness conclusion from a landing page. |
| 7. [NeoMotion](https://www.neomotion.net/) | AI editing aimed at long-form, with editable scenes, charts, layers, captions and keyframes. | Study reusable scene layouts and structured graphics rather than only generic cuts. | Lower priority for Roblox montage pacing; inspect real exports before adopting a workflow. |

## Established editors: the polish references

| Product | Relevant capability | What Bopzi should learn |
|---|---|---|
| 8. [CapCut](https://www.capcut.com/tools/keyframe-animation) | Position, scale, rotation and other keyframes; speed curves; integrated social editing tools. | Accessible motion controls, reusable effect recipes, fine timing and easy manual correction. Its marketing use of “AI” does not change the underlying need for interpolation and curves. |
| 9. [Adobe Premiere](https://www.adobe.com/products/premiere/ai-video-editing.html) | Media Intelligence search, object masking, text-based cuts, speech tools, reframing and audio ducking. | Good footage search, tracked masks, precise tools and audio controls. Fosia's host supplies substantial existing editing infrastructure. |
| 10. [DaVinci Resolve / Fusion](https://www.blackmagicdesign.com/products/davinciresolve/whatsnew) | Keyframe/curve editors, Fusion effects and motion graphics; script-based assembly and audio-driven animation among current documented features. | Compositing, animated properties, explicit curves, reusable graphics and serious audio finishing. AI functions and availability vary by edition/version. |
| 11. [Final Cut Pro](https://www.apple.com/final-cut-pro/) | AI-assisted search/masking and an established timeline; iPad page also describes beat-cut montage creation. | Responsive manual editing, magnetic arrangement and clear separation between assistive features and core editing. Mac and iPad features are not interchangeable. |
| 12. [Filmora](https://filmora.wondershare.com/) | Timeline editing, tracking, text animation, beat sync, audio ducking and AI assistance. | A broad approachable toolset is a useful middle ground between an automatic clip generator and a professional compositor. |

## Browser/social editors and finishing tools

| Product | Main documented direction | Roblox fit |
|---|---|---|
| 13. [Descript / Underlord](https://www.descript.com/underlord) | Conversational editing plus transcript-based edits and scene/layout tools. | Strong workflow reference for narrated developer updates. Pure gameplay requires visual event understanding beyond a transcript. |
| 14. [Kapwing](https://www.kapwing.com/ai) | Browser AI video creation/editing, captions and reusable effects. | Relevant for easy browser corrections and asset reuse. Arbitrary smooth counter creation was not established in this research. |
| 15. [VEED](https://www.veed.io/tools/ai-video) | Browser video generation, editing, captions, branding and related AI tools. | Useful onboarding and caption workflow reference. Its generation page does not establish a general conversational motion-graphics engine. |
| 16. [Captions](https://captions.ai/) | Style-directed AI edits, captions, B-roll and chat-based changes. | Study complete visual styles and coordinated typography. Gameplay-specific quality needs its own test. |
| 17. [Submagic](https://www.submagic.co/) | Animated captions, zooms, trimming, transitions, images/GIFs and sound effects. | Study small coordinated finishing actions and readable captions. Avoid assuming automatic effects always improve an edit. |

## Highlight extraction and gameplay capture

| Product | Public direction | What matters for Bopzi |
|---|---|---|
| 18. [OpusClip](https://www.opus.pro/) | ClipAnything explicitly includes gaming; reframing includes object tracking/manual guidance. | Candidate highlight search and reframing, with user correction. Broad genre support does not prove reliable detection of a specific Roblox game's events. |
| 19. [Vizard](https://vizard.ai/) | AI clipping and social video editing. | Useful for reducing long recordings into reviewable candidate clips. Fine motion design should be evaluated separately. |
| 20. [Riverside](https://support.riverside.com/hc/en-us/articles/12124048765981-About-Magic-Clips) | AI highlights from recordings, uploads and conversation. | Relevant to devlogs/interviews, lower-priority inspiration for silent gameplay and cinematic trailers. |
| 21. [Eklipse](https://eklipse.gg/) | Gaming/stream highlight generation. Its [help page](https://eklipse.gg/help/how-does-the-ai-actually-detect-a-highlight-in-my-stream/) describes visual, audio and supported-game signals. | Combine several event signals; do not equate a loud sound with a good gameplay moment. Per-game support matters. |
| 22. [Medal](https://medal.tv/developer/roblox/autoclipping) | Explicit Roblox developer-triggered clips for kills, wins, rare drops and other game events. | The strongest Roblox-specific workflow insight: developer-authored event markers can supply reliable semantics and timestamps. This is capture/event infrastructure, not a Fosia-like animation agent. |

## Editing automation plugins and cleanup products

| Product | Public direction | Priority for Roblox |
|---|---|---|
| 23. [FireCut](https://firecut.ai/) | Premiere/Resolve automation: silence cutting, captions, zoom cuts, B-roll and podcast workflows. | Useful for commentary and faster first passes. Not evidence of an unrestricted procedural animation assistant. |
| 24. [AutoPod](https://www.autopod.fm/) | Podcast/multicamera automation for Premiere. | Lower priority for gameplay; useful lesson in narrow, reliable automation. |
| 25. [Gling](https://www.gling.ai/) | AI editing for YouTube and cleanup of recordings. | Helpful for developer talking-head updates; limited relevance to effects-heavy montages without further testing. |
| 26. [Wisecut](https://wisecut.ai/) | Automated clipping/editing for podcasts and YouTube. | Pacing/cleanup reference, not the central motion-design benchmark. |

## Broader agents, music editing and generative video

| Product | Public direction | Decision |
|---|---|---|
| 27. [InVideo editor](https://invideo.io/editor/) | Editable multitrack agent editing; documented motion/keyframes, sound design, reference-directed style and manual controls. | A direct competitor worth benchmarking. Evaluate the actual editor rather than assuming it is only a prompt-to-stock-video generator. |
| 28. [freebeat](https://freebeat.ai/ai-editor) | AI music-video editing and beat-oriented shot/lyric arrangement. | Study music structure, beat maps and where cuts land. Beat alignment alone does not establish good selection or pacing. |
| 29. [Runway](https://runway.com/product/ai-video-editor) | Aleph changes content within footage, such as backgrounds, lighting and objects. | Useful optional shot transformation. Exact readable counters, synchronized captions and reliable numeric overlays belong in a graphics/compositing system. Do not infer API support from a web-app feature. |

## Motion tools and rendering references, not direct equivalents

| Tool | Documented capability | Bopzi use |
|---|---|---|
| 30. [After Effects](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-controls/expression-controls.html) | Animatable properties and expression controls including sliders. | Benchmark exact numeric animation, reusable graphics and finishing quality. It is not itself a Fosia-like chat editor. |
| 31. [Remotion](https://www.remotion.dev/docs/interpolate) | Frame-evaluated interpolation; [springs](https://www.remotion.dev/docs/spring); a React [preview player](https://www.remotion.dev/docs/player). | Candidate composition infrastructure for procedural counters and animated overlays shared by preview/export. It is a framework, not a finished editor or automatic taste engine. Check current [license/pricing](https://www.remotion.dev/license) before selecting it for a product. |
| 32. [Jitter](https://jitter.video/) | Browser motion-design tooling. | Study approachable animation authoring and reusable motion assets. Treat it as a design reference, not proof of conversational gameplay editing. |

Additional leads: [Keyframes](https://www.keyframes.so/) could not be fetched reliably; [Recut](https://recut.ai/) could not be verified from the attempted page; [Powder's game-model page](https://www.powder.gg/highlighting/game-models) surfaced older material, so present availability was not established; [Timeline Studio](https://github.com/MartinDelophy/ai-video-editor) surfaced as another open-source lead but was not audited. These do not receive a capability ranking here.

## Why Bopzi currently feels basic

Current code inspected during this research:

- `src/video/model.ts`: `Clip` has fixed speed/zoom/framing values. `Title` has one text value and fade/none animation. There is no numeric-counter item or general animated-property/keyframe representation.
- `src/app/api/video/edit/route.ts`: the AI is given that constrained schema and returns an entire replacement timeline. It sees metadata and poster frames rather than full temporal visual context. Captions are generated separately from audio in the current project.
- `src/video/VideoEditor.tsx`: titles/logos/captions are prepared as still PNG artwork for export.
- `src/video/render.ts`: fixed transforms and overlay holds can render a cut, but do not provide a general procedural graphics compositor.

Consequences: the assistant cannot request a real smooth count-up, animated zoom curve, proper speed ramp, tracked arrow, or word-by-word caption treatment through the present schema. Asking the model to be more creative cannot add missing engine operations. Returning multiple static number titles would be an inefficient workaround and would still lack consistent easing and typography.

Also change the current “closest available substitution” rule: when a requested feature is materially different, explain the limit and offer an alternative. A still zoom is not an animated push-in; static numeric text is not a smooth counter. AI completion summaries should describe the operations actually applied.

## Define “polished” in observable terms

1. Motion has deliberate acceleration/deceleration, an anchor, readable hold and controlled exit.
2. Clip boundaries, captions, effects and audio agree on the same frame/timebase.
3. The user can seek to any frame and see the same result as export.
4. Typography stays legible and stable as content changes; important HUD areas remain visible.
5. Sounds hit the intended event; music and dialogue have sensible relative levels.
6. Local changes preserve unrelated edits, audio synchronization and protected layers.
7. A style has coordinated choices: font, outline, spacing, timing, sound and restrained effects.

## Smooth counter: first acceptance feature

Example instruction: “At 2 seconds, count from $0 to $1,000,000 over 1.5 seconds, easing out. Hold the final value for half a second and give it a small pop.”

Represent this as one editable counter, not a pile of text clips:

```json
{
  "type": "counter",
  "from": 0,
  "to": 1000000,
  "startFrame": 120,
  "durationFrames": 90,
  "holdFrames": 30,
  "easing": "easeOutCubic",
  "format": { "prefix": "$", "decimals": 0, "grouping": true },
  "digits": "tabular",
  "finish": "small-scale-pop"
}
```

This example assumes a 60 fps project. Evaluate progress from the requested render frame, clamp to [0,1], apply easing, interpolate the numeric value, then format it. Use the same evaluator in preview and export. Keep the numeric value monotonic and exact at the endpoint; any bounce belongs to the counter's visual scale, not its amount. A fixed layout or tabular digits prevents wobble as number widths change.

For an odometer look, rolling digit columns can be another visual renderer of the same counter data. That is separate from simply replacing the displayed integer each frame. A short million-unit count necessarily skips intermediate integers; smoothness means stable, regularly sampled motion and legible presentation, not showing every integer.

Acceptance checks: exact start/end; known midpoint; no numeric overshoot; large/negative/decimal values; commas and prefixes; reverse seeking; 30 and 60 fps; no font/layout wobble; preview/export frame comparisons. A rendered-video test must inspect intermediate frames, not merely validate JSON or confirm that an MP4 exists.

## Proposed architecture

**Analysis:** decode/proxy media, inspect multiple temporal frames, transcribe speech with word timestamps, detect audio onsets/beats, identify scene changes and optionally OCR selected HUD regions. Store evidence with timestamps and uncertainty. Avoid presenting guessed gameplay events as certain.

**Plan:** let the AI select targets and supported operations, specify duration and intensity, and identify the expected result. Maintain a small library of complete editing recipes, not a prompt listing every possible effect.

**Operations:** prefer versioned, validated edits such as `addCounter`, `animateProperty`, `setSpeedRamp`, `addImpact`, `addCaptionStyle`, `duckAudio`, `trackOverlay` and `setTransition`. Each targets stable item IDs. Check the base project revision before applying; group a request into one undoable transaction. Preserve unrelated work. Add operations incrementally alongside existing simple edits.

**Composition:** introduce frame-based animation evaluation and a real layer graph: video, image, text, numeric counter, shape, caption and reusable composition. Each has a local timeline, anchor, transform and opacity, with keyframes/easing where supported. Keep source time and timeline time separate, especially for variable speed. Variable speed requires integrating the speed curve and preserving audio synchronization, not changing `setpts` alone.

**Rendering:** prototype Remotion for motion compositions and the preview/render shared definition, while retaining FFmpeg for media normalization, proxy generation, encoding and audio tasks. Benchmark import latency, preview responsiveness and export cost before migrating the full editor. A shared Canvas/WebGL evaluator is an alternative if Remotion proves unsuitable, but maintaining a renderer is substantial work. Static title PNGs can remain a fast path for non-animated graphics.

**Review:** render short before/after previews around modified ranges, inspect representative frames, validate bounds/readability/audio peaks, and produce an actual change summary. Automated review can catch defects, while users retain creative judgment.

## Roblox-specific opportunity

Roblox is not one visually uniform game. Event detection should support per-game rules and developer-supplied context. For developers controlling their own experience, an optional Studio companion could export a simple timestamped event file beside a recording: boss defeated, stage completed, rare drop, balance changed, update feature shown. Medal demonstrates that explicitly triggered events are a practical Roblox capture pattern; a Bopzi marker workflow would still need its own synchronization and implementation.

Three editing recipes should be deliberately distinct:

- **Meme/gameplay Short:** setup → event → reaction → payoff. Event-timed zoom/freeze/sound, optional counter and short readable captions.
- **Launch/update trailer:** hook → core loop → escalation/new feature → payoff → logo/CTA. Clean titles and music structure, without stuffing every beat with effects.
- **Roblox discovery preview:** separate destination preset preserving current gameplay fidelity and avoiding unsupported promotional treatments. Check current Roblox placement guidance before adding an export badge or promising eligibility.

Make individual operations approachable: “Count from…to…”, “Follow this player”, “Zoom here”, “Sync these cuts”, “Lower music under speech”, and “Use this caption style”. Advanced curves should exist behind an inspector without being required to get a good result.

## Recommended build order

| Stage | Deliverable | Acceptance condition |
|---|---|---|
| 1. Motion foundation | Frame/timebase, animated transforms, easing, counter, shared preview/export | Smooth count-up passes frame-level tests and exports identically. |
| 2. Reusable finishing | Punch-in/out, small shake, freeze frame, flash, outlined word captions, audio fades/ducking | One gameplay beat can be polished manually and via AI without desynchronizing other elements. |
| 3. Better context | Multiple sampled frames, word timing, waveform/onsets, beat map, scene boundaries | AI can point to why a candidate moment was selected, and user can correct it. |
| 4. Roblox recipes | Meme Short, horror teaser, update reveal; optional event-marker import | A recipe makes coherent editable decisions on real Roblox recordings, not only demo images. |
| 5. Tracked polish | Subject tracking, tracked arrows/crops, masks, more demanding retiming | Review actual rendered clips and recovery when tracking or decoding fails. |

First implementation slice: a manually usable animated counter, smooth position/scale animation and the same operations exposed to AI. This directly addresses the complaint and establishes infrastructure reusable by captions, zooms, progress bars, XP bars and logo reveals.

## Benchmark before choosing a competitor or declaring improvement

Use the same source clips and music in Bopzi, CapCut, one direct AI timeline editor and one established compositor. Do not compare a curated marketing demo against an unedited upload.

1. $0 → $1,000,000 counter in 1.5 seconds; exact endpoint and steady typography.
2. Smooth push-in, a short hold and controlled zoom-out, all at specified timestamps.
3. A 20-second cut aligned to supplied music markers, without cutting away the payoff.
4. A rare-drop or clutch sequence with setup intact and a sound at the event.
5. Three-word highlighted captions with readable outline and no HUD overlap.
6. A tracked arrow/crop following an avatar, with correction when tracking fails.
7. A 60 fps source exported at 60 fps; synchronized source audio through a speed change.
8. A narrow revision: “make only the last zoom softer” preserves titles, cuts and audio.

Score exactness, visual coherence, sound timing, controllability, correction time and export fidelity. Repeat tasks to measure consistency. Treat vendor promises, single successful demos and successful file generation as insufficient evidence of polish.

## Shortlist

Study **CapCut** for accessible manual polish, **Agent28/VedPilot/InVideo** for conversational timeline UX, **Kaestral/Palmier/Framedeck** for explicit agent tools and composition architecture, **After Effects/Fusion/Jitter** for motion craft, and **Medal** for the Roblox developer event workflow. Benchmark actual exported results before recommending a purchase or switching Bopzi to another codebase.

Only this research document was added for this request; application code was not changed.
