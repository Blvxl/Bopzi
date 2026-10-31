# What Bopzi's video AI cannot do yet

Research: 16 October 2026. This replaces the generic feature list in [ai-video-editor-features-2026-10-16.md](ai-video-editor-features-2026-10-16.md) with a gap audit of the **AI assistant itself**. It is based on reading the full prompt in `src/app/api/video/edit/route.ts` and the request built in `VideoEditor.tsx:372–374`, and on comparing that with what the manual editor and the engine support. External research covered what Roblox/Shorts creators commonly ask for.

The short answer: **the AI is mostly blind and deaf, and it can only touch part of what the editor can do.** Most "the AI is bad" moments come from those two problems, not from the model.

## 1. What the AI cannot perceive (biggest gap)

Each request receives one poster frame per asset (max 8), one frame at the playhead, filenames, durations and the timeline JSON. That is all.

| Missing input | Consequence | It already exists in Bopzi |
|---|---|---|
| **What is said.** The prompt states captions are "left out to save space"; caption text is never sent. | "Cut where I say 'no way'", "remove the part where I'm talking about lunch" and "put a title when I say the code" are impossible. | Word-timed transcripts (`transcribe.ts`) |
| **The beat.** `musicBeats` is computed but not sent; the prompt even says "never claim beat detection". | "Cut on the beat" or "punch on the drop" can't work through chat, only through the Sync button. | `beats.ts` |
| **What happens over time.** One poster per video, usually its first frame. | It can't find "the moment I die", "when the boss appears" or "the funniest part". Every cut it makes is blind. | Proxy video can be sampled for frames |
| **Loudness / audio events.** | It can't find explosions, screams or silence. | Onset code in `beats.ts` |
| **Its own result.** It never sees a render of what it made. | A title over the HUD, a highlight box on the wrong object, or a zoom off target is never noticed. | Preview canvas can render any time `t` |
| **Long history.** Only the last 6 messages are kept, at 1,500 characters each. | "Like before, but faster" fails in long sessions. | Saved messages per project |

**Fix order:** send the transcript as compact `[t] word` lines (cheap text). Send the beat list (strong beats only). Send a contact sheet of about 12–24 sampled frames per clip with timestamps (one image each, not dozens). Add a per-second loudness line. Together, these turn "I can't see your footage" into actual footage-aware editing.

## 2. What the editor can do but the AI isn't allowed to

The manual editor can do these; the AI's schema leaves them out or says to "preserve" them.

- **Animate titles, overlays and effects with keyframes.** `LayerSettings.keyframes` exists, but the prompt says `layerSettings belong to the editor; preserve them`. So "make the text fly in from the left and spin" is impossible through the AI, even though you can do it by hand.
- **Attach a layer to a clip** (`attachLayer` in `workflow.ts`). The AI can't make a title "stick to this clip" so it moves when the clip is reordered.
- **Rename, hide, group and lock layers** (compounds, layerSettings).
- **Use recipes** (`recipes.ts`: Robux reveal, kill streak, rare drop and so on). The AI rebuilds them badly from parts instead of calling the real recipe.
- **Beat sync** (Punch on every bar / 2 beats / beat).
- **Effect presets the user saved** (`presets.ts`). "Use my usual zoom" can't work.
- **Fix a caption word.** It can only `make`, `keep` or `remove` all captions. It can't correct "Roblocks" → "Roblox", split a long line or drop one caption.
- **Caption highlight colour per word, emphasis on one word** ("make MONEY red").
- **Title look.** Titles have no stroke/glow/shadow field (`Title` type, `model.ts:15`); only captions have `TextLook`. This is missing in the engine too (see 3).

**Fix:** expose these as fields or operations. Most are schema additions, because validators and the UI already exist.

## 3. What neither the AI nor the engine can do

These are what Roblox and Shorts creators ask for most, based on recurring CapCut Roblox-edit tutorials and Shorts editing guides (sources below). Each would need engine work first, then an AI field.

| Missing | Why creators want it | Notes |
|---|---|---|
| **Colour grading / filters** (brightness, contrast, saturation, HSL, "CC" looks) | "Colour correction" is a staple of Roblox edit tutorials. | Canvas `ctx.filter` in preview plus `eq`/`hue` in FFmpeg. No colour field exists today. |
| **Second video layer: picture-in-picture, facecam, split screen, before/after side-by-side** | Facecam reactions and "game top / content bottom" are the standard Shorts gaming layouts. | Clips are one sequential track, and overlays are images only. |
| **Video overlays / green-screen memes** (glass break, explosions, meme reactions) | Overlay effects are a common Roblox CapCut tutorial topic. | Needs video overlays plus chroma key. |
| **Text behind the avatar** | A popular Roblox edit trick. | The traced masks for highlights (`mask.ts`, `track.ts`) can draw the subject *over* a title. This is mostly reuse. |
| **Labels/arrows/emoji that follow a tracked object** | "Put an arrow on me and follow me". | Only a highlight's `label` follows. Titles and overlays can't attach to a track, but the track data exists. |
| **Blur / pixelate a region** (usernames, chat, faces) | Privacy and moderation for Roblox footage. | No blur effect. Can reuse the highlight box plus tracking. |
| **Reverse / rewind** | A classic meme edit ("rewind" sound already exists in `sounds.ts`). | No reverse playback. |
| **Directional / motion blur on demand** | "Oblique blur" and shake-blur edits are common in tutorials. | Motion blur exists only during zoom punches and transitions. |
| **Shapes and bars** (progress bar, health bar, subscribe button, lower third) | Needed for XP/progress reveals and calls to action. | No shape layer. |
| **3D text / rotation for titles** | "Spin the text" | Partly possible via manual keyframes (rotation), not via the AI. |
| **Audio tools**: trim music to the beat, voice effects (pitch, robot, echo), audio speed, text-to-speech voiceover, AI music | Voiceovers and memes. | `speed` affects clip audio only. No TTS or generated audio; that needs a hosted API. |
| **Multiple text styles in one title** (one word bigger or coloured) | Hooks like "I got **1,000,000** Robux" | One colour and size per title. |

## 4. How the AI works as an agent

- **It rewrites the whole timeline every time.** The model returns a complete `timeline` JSON, and `mergeAiEdit` then reconciles it. That makes requests slow, risks silently changing unrelated things on big projects, and limits how big a project can be. Use **operations** instead (`addEffect`, `updateTitle`, `cutRange`, `moveClip`, …) that target IDs. This was recommended on 14 October and is still not done.
- **One shot, no plan, no questions.** It can't ask "which death, the first or the second?" or say "here are 3 hook options, pick one". A `question` response type and a `choices` response type would fix both.
- **No self-check.** After applying, render 3–6 frames of the changed range and have the model check them (text readable, box on the object, nothing over the HUD), then retry once if needed. `ai-review.ts` already compares data, but nothing compares pixels.
- **One request at a time** (`editing` lock), 150-second timeout, 1,500-character limit. It can't run long jobs like "make 3 versions" or "go through all 10 clips".
- **No partial undo.** Keep/Undo applies to the whole response. With operations, each one can be reverted.
- **Clip-level only.** It can't say "cut 2.3 s–4.1 s out of the middle" without rebuilding the clip list by hand. A `cutRange(start, end)` operation in timeline seconds would remove most trimming mistakes.
- **No memory of the user's style** across projects (Descript added this in 2026).

## Recommended order

| # | Change | Effort | Unlocks |
|---|---|---|---|
| 1 | Send transcript, beats, a loudness line and a sampled contact sheet per clip | S–M | Footage-aware cuts: "cut where I say…", "on the beat", "when it explodes" |
| 2 | Operations instead of a whole-timeline return, plus `cutRange` | M | Speed, safety on large projects, per-operation undo |
| 3 | Let the AI write layer keyframes, attachments, recipes, beat sync, presets and caption text fixes | S–M | Everything already built becomes reachable by chat |
| 4 | Self-check render plus one retry | M | Catches wrong boxes, unreadable text, HUD overlap |
| 5 | Engine: colour grade, blur region, reverse, text-behind-subject (mask reuse), labels that follow tracks | M each | The most-requested Roblox edit effects |
| 6 | Engine: second video track (PiP / facecam / split / video overlays + chroma key) | L | Reaction and meme formats |
| 7 | `question` / `choices` replies, saved style instructions | S | Fewer wrong guesses |

Item 1 alone will probably make the biggest difference users notice. At present the model is asked to edit gameplay it has effectively not seen or heard.

## Sources

- [CapCut Roblox edit tutorials (TikTok discover)](https://www.tiktok.com/discover/roblox-edit-tutorial-in-capcut), [advanced Roblox CapCut tutorial](https://www.youtube.com/watch?v=0HpK0n7AmaE), [How To Edit Video Roblox in CapCut (2026)](https://www.youtube.com/watch?v=dlvaWRFkDMA): colour/HSL, overlays, text behind avatar, shake/oblique blur, beat cuts.
- [Splice: mastering YouTube Shorts editing (June 2026)](https://spliceapp.com/blog/mastering-youtube-shorts-editing-guide/), [Subscribr: advanced Shorts editing](https://subscribr.ai/youtube-strategy/advanced-youtube-shorts-editing-storytelling): pacing, word captions, speed ramps, reaction/split layouts.
- [Cutback: editing video with an LLM](https://cutback.video/blog/how-to-edit-videos-using-an-llm-chatgpt-vs-claude-vs-selects), [HeyEddie: can ChatGPT edit videos](https://www.heyeddie.ai/blog/how-to-edit-video-with-chatgpt), [OpenChatCut tool check](https://cyber-ivy.com/en/articles/openchatcut-local-ai-video-editor-tool-check-2026): LLMs fail without footage/transcript access; agents that write concrete timeline operations are the converging design.
- [Descript Underlord instructions](https://www.createwith.com/tool/descript/updates/descripts-underlord-now-remembers-your-editing-preferences-across-projects): persistent style memory.

Only this research document was added; application code was not changed.
