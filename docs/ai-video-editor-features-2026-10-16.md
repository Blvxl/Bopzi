# More features for Bopzi Video: second research pass

Research date: 16 October 2026. Follows [ai-video-editor-research-2026-10-14.md](ai-video-editor-research-2026-10-14.md) and [video-editability-research-2026-10-14.md](video-editability-research-2026-10-14.md).

Since that research, Bopzi Video has gained counters, zoom/shake/flash/traced highlights, keyframes, speed ramps, freeze frames, six transitions, word-timed local captions with style presets, beat detection, automatic SFX on effects, five Roblox recipes, groups, named cuts, effect presets and a verified AI change review. This pass therefore leaves those out and lists only **features not yet in `src/video/`**. A grep of the code for loudness normalisation, safe zones, silence detection, translation and video-to-thumbnail found none of them.

Most of the evidence here is from vendor pages and third-party reviews. It shows what competitors are shipping, not how good it is. Items marked *unverified* need to be checked before building on them.

## What competitors added in 2026

| Product | New direction | Source |
|---|---|---|
| CapCut **EditPilot** (PC) | An AI editing partner in the multitrack editor: trims, removes filler words and pauses, reorders scenes, adds transitions and **generates alternate versions** of an edit. | [Pixflow changelog](https://pixflow.net/blog/capcut-2026-update/), [BibiGPT](https://bibigpt.co/en/features/capcut-2026-ai-suite-explained) |
| CapCut **Skills** | A repeated workflow saved as a one-click action. | [Pixflow](https://pixflow.net/blog/capcut-2026-update/) |
| Descript **Underlord instructions** | Editing preferences stored once and applied to every project; `@` targets a scene or timestamp in a request. | [createwith](https://www.createwith.com/tool/descript/updates/descripts-underlord-now-remembers-your-editing-preferences-across-projects), [Descript help](https://help.descript.com/hc/en-us/articles/36803785502221-Underlord-beta-Your-AI-co-editor-in-Descript) |
| Loopdesk | Gameplay commands: "Cut the loading screens", "Split this into rounds", "Clip every fight where the audio spikes", "Find the moments I got excited", plus mic/game audio levelling. Each maps to a detectable signal. | [Loopdesk](https://loopdesk.ai/blog/ai-video-editing-for-gamers) |
| Eklipse **AI Edit / Content Agent** | 16:9 → 9:16 that keeps crosshair, killfeed and facecam visible; safe-zone templates; batch processing through one template; an agent that finds moments, edits and queues posts for approval. | [Eklipse](https://eklipse.gg/features/ai-edit/) |
| OpusClip | A 0–100 virality score per clip (hook, pacing, topic) and hook detection. Reviewers note the score isn't personalised. | [OpusClip API blog](https://www.opus.pro/blog/viral-moment-detection-api), [review](https://marcandrews.com/opus-clip-review-2026-ai-video-shorts-tool-tested/) |
| Hook analysers (HowHooking, Shorta) | Score only the first 3 seconds; show where viewers drop off. | [Trend Hunter](https://www.trendhunter.com/trends/howhooking), [PeerPush](https://peerpush.com/p/shorta-shorts-analyzer) |
| "Hook Teaser / Cold Open" pattern | Copy a few seconds of the payoff to the very start of the video. | [Notion workflow](https://cnapsstudio.notion.site/Tool-Video-Editing-Hook-Teaser-Cold-Open-39af00afbadf80abb77fecf1a87d516c) |
| Premiere **Media Intelligence** | Natural-language search over footage, analysed on the user's machine. Caption translation into 27 languages. | [OWC](https://www.owc.com/blog/adobe-powers-up-premiere-pro-with-several-new-ai-features-and-workflow-enhancements) (2025, still current) |
| ElevenLabs video-to-SFX | Sample frames → have an LLM write a sound prompt → generate the sound. There is no native video endpoint; it is a pattern built on top. | [Tom's Guide](https://www.tomsguide.com/ai/i-tried-the-new-elevenlabs-video-to-sound-effects-demo-and-its-pretty-amazing), [Sonilo comparison](https://sonilo.com/blog/comparisons/video-to-sound-effects-api-comparison-2026) |
| Roblox **Video Captures API** (beta) | `CaptureService.StartVideoCaptureAsync` / `StopVideoCapture`, up to 30 s, user chooses whether to save to their gallery; names and UI are stripped. The API reference also lists `StartVideoCaptureForMCPAsync`. *Unverified: what that MCP variant does, and whether raw files are accessible.* | [DevForum](https://devforum.roblox.com/t/beta-video-captures-api-bring-your-gameplay-moments-to-life/3823116), [reference](https://create.roblox.com/docs/reference/engine/classes/CaptureService), [API updates](https://robloxapi.github.io/ref/updates/index.html) |
| Roblox **Moments** | An in-app feed of gameplay clips: trim to ≤30 s, add music, viewers jump straight into the experience. | [TechCrunch](https://techcrunch.com/2025/09/05/roblox-announces-short-form-video-feed-for-gameplay-clips-new-ai-tools-for-creators-and-more) |

**The trend:** The AI is becoming a **cleanup + selection + variants** engine wrapped around a normal editor. It is not becoming a better prompt-to-video generator. Bopzi already has the editor and motion. Its gap is everything that happens *before* the edit (finding and cleaning footage) and *after* it (hook, versions, publish checks).

## Recommended features, in priority order

Effort: **S** about a day, **M** a few days, **L** a week or more. All of these work with the current local Codex + FFmpeg setup unless noted.

### Tier 1: cheap, high value, fits what exists

1. **Dead-time cleanup** (S–M). Find black frames, frozen or loading screens, and long static stretches, then propose cuts with Keep/Undo. Run FFmpeg `blackdetect` / `freezedetect` server-side, or compare luminance across sampled poster frames in the browser. Roblox has obvious targets: loading screens, teleport fades and the respawn wait. Show each proposed cut as a strip on the timeline before it is applied.
2. **Silence and filler removal for commentary** (S). The word timings from `transcribe.ts` already exist. Cut gaps over N ms and filler words ("um", "uh", "like") on clips that have speech, and keep video and audio in sync. This is CapCut EditPilot's and Descript's headline feature, and Bopzi has the data already.
3. **Audio level normalisation on export** (S). Add a two-pass FFmpeg `loudnorm` per role: commentary about −14 LUFS, music lower, SFX capped. It fixes the most common amateur problem (a quiet voice under loud game audio) and adds no UI.
4. **Platform safe-zone overlay** (S). A toggleable guide in the preview showing where Shorts, TikTok, Reels and Roblox Moments put their UI. AI review then warns when a caption, counter or title sits inside it. Eklipse ships safe zones in every template.
5. **Persistent "My style" instructions** (S). A short project or global text ("always MrBeast captions, no shake, end with my logo") added to every `/api/video/edit` prompt. This is the Underlord instructions pattern. It is a few lines in `route.ts` plus a settings field.
6. **Frame → thumbnail studio** (S). "Use this frame as a thumbnail" sends the current frame, clean or with the edit, into `/studio` as a screenshot to improve. Nobody else has both tools, and the two Bopzi products get stronger together.

### Tier 2: the differentiators

7. **Highlight finder with reasons** (M). Score candidate moments using signals Bopzi can compute locally: game-audio spikes above the session baseline (reuse the onset code in `beats.ts`), mic excitement (loudness/pitch jumps on transcribed speech), scene changes and motion density. Show them as markers labelled with *why* ("audio spike +14 dB, you shouted 'no way'"), and let the AI build the cut from the markers the user keeps. This follows the earlier advice not to equate loud with good: the user confirms the moments.
8. **Hook tools** (M):
   - **Cold open:** copy 1–3 s of the payoff, or a chosen highlight, to the start with a flash or whip into the real setup. It can be one recipe in `recipes.ts`.
   - **Hook check:** have Codex review the first 3 s (frames, captions, audio level) and return a few concrete fixes. Present these as suggestions, not a fake "virality score".
9. **Alternate versions** (M). Ask the AI for 2–3 variants (calm/loud, 15 s/30 s, different hook), each stored as a `NamedCut` that the user can flip between. Named cuts already exist, so this is mostly prompt work plus a compare UI. EditPilot advertises the same thing.
10. **Vertical layouts that keep the HUD** (M). Stacked 9:16 templates: a gameplay crop on top and a chosen HUD region (leaderboard, kill feed, currency counter) or facecam at the bottom, each region set once by dragging a box. This is more useful than `focusX` alone for Roblox, where the key information is often in a corner.
11. **User-made recipes ("Skills")** (M). "Save this as a recipe" captures a group of selected effects, titles and sounds relative to a moment, then reapplies it at the playhead or across many clips. This extends `presets.ts` from a single effect to a whole beat.

### Tier 3: bigger bets

12. **Footage search** (L). Index sampled frames with short Codex-written descriptions once per import, then answer "find where I open the chest" with ranked timestamps. Cost and latency through the local subscription need measuring first, because many frames means many requests.
13. **Caption translation and multi-language export** (M). Translate caption text through Codex while keeping word timings, mapped proportionally, and export one MP4 per language. It is cheap to build, but check line-length limits in the vertical format.
14. **AI-placed SFX for visual events** (M). Use the ElevenLabs demo's pattern, but pick sounds from Bopzi's own library instead of generating audio. Codex looks at frames around a moment and places a cue from `sounds.ts`. Generated audio would need a hosted sound API, which is out of scope for the local-only setup.
15. **Roblox capture companion** (L, *unverified*). A Studio/experience script that logs timestamped game events (boss defeated, rare drop, stage clear) and can trigger `StartVideoCaptureAsync`. Bopzi imports the event file as markers. Before committing to this, check whether `StartVideoCaptureForMCPAsync` lets the Studio MCP record a playtest directly, which would remove manual screen recording for developers. Player captures go to the Roblox gallery, and the docs don't confirm raw MP4 access.
16. **Roblox Moments preset** (S, once 15 is understood). A ≤30 s vertical preset with a duration warning, alongside the existing formats.

## Not recommended now

- **Generative video (Seedance, Veo, Kling) inside the editor.** It needs hosted APIs and credits, and it doesn't solve the gameplay-editing problem.
- **A numeric virality score.** Reviewers find these unpersonalised. Concrete hook fixes are more honest and more useful.
- **Auto-posting and scheduling.** This needs OAuth to every platform and a hosted backend.

## Suggested first slice

Items **1, 2, 3 and 6** together make "import a raw Roblox recording → clean it → export with good audio → make the thumbnail" work end to end. They are mostly deterministic, local and testable with the existing `tests/video.test.cjs` harness. Item **7** (highlight finder) is the most valuable next step after that.

Only this research document was added for this request; application code was not changed.
