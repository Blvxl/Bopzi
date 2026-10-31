# Bopzi thumbnail quality research — 31 October 2026

## Goal and evidence
Improve the quality of a single generated Roblox game thumbnail. The user explicitly prefers one generation per request. This is a research audit, not proof that any proposed change improves results: no controlled image generation comparison or access to the user's disliked output was performed.

## Platform and design findings
- Roblox recommends 16:9 at 1920×1080, gameplay-relevant imagery, appropriate theme and color, and keeping essential content away from the bottom where metadata may cover it. Home personalization accepts 2–5 active images under 3 MB; the reported 8.5% average qualified-play-through improvement is for personalization, not a guarantee for a specific design. One-at-a-time generation can still support optional later variants. https://create.roblox.com/docs/production/publishing/thumbnails
- Roblox says misleading or closely duplicated imagery may limit discovery; a custom thumbnail is needed for Home recommendations. Match the actual game, not just the appearance of another game. https://create.roblox.com/docs/discovery
- OpenAI recommends clear subject, action, environment, style and explicit roles for a small set of references, and targeted iteration. This is guidance, not a benchmark proving short prompts always win. https://openai.com/academy/image-generation/ and https://developers.openai.com/cookbook/examples/multimodal/image-gen-1.5-prompting_guide
- The key practical test is whether the action, subject and stakes are legible at the actual preview size; a visually polished full-size image can fail at feed size. Avoid treating 320px or a particular safe margin as an official Roblox measurement. https://create.roblox.com/docs/production/publishing/thumbnails

## Current Bopzi audit
1. `src/studio/Composer.tsx` chooses a random popular reference even when the user did not pick one; it forces match style and layout. Genre matching is based on a handful of keywords. This can impose an unrelated look and produce inconsistent results on identical prompts. Hypothesis: stop silently selecting a reference and honor chosen style; evaluate before claiming improvement.
2. `src/lib/thumbnail/prompt.ts` supplies many repeated directives, rigid hero/prop composition and a foreground object, flat face and all-sharp rendering, even where not requested. This can compete with the user's actual scene or generate formulaic thumbnails. Preserve identity, exclusions, setting and explicitly requested viewpoint; let the brief determine composition and expression.
3. Style references are blurred and transformed into a shuffled swatch in `server.ts` and `style.ts`, while the sharp image is described separately. This tries to limit scene copying, but may discard meaningful style cues; test it against a sharp reference with explicit roles, evaluating both unwanted copying and style fidelity. Keep the current path until measured.
4. Scene rewriting attempts to correct mistakes automatically. This might change intentional names or details; assess request fidelity explicitly before changing it.
5. The existing Roblox preview and editable layers offer an opportunity to inspect at small size and add precise typography separately. Image text can still be appropriate when requested.
6. Prior research `docs/thumbnail-studio-research-2026-10-18.md` recommended several generations per request. That conflicts with the user's newer preference for one, so do not reinstate a batch.

## Recommended evaluation before tuning
Build a small fixed set of real briefs spanning obby, simulator, horror, first-person and character/object references. Preserve the exact prompt, reference files and generation settings, compare current against one change at a time, and blind-review multiple samples per brief because image outputs vary. Score separately: requested subjects and action; identity; layout/viewpoint and exclusions; readability at full and feed size; visual craft; unwanted reference copying. Track failures and generation time. Ask the user for examples they dislike and examples they want to match; those define the aesthetic target. Avoid claiming click-through improvements without actual Roblox impression and qualified-play data.

## Priority
First test removal of automatic random references, then simplify default composition instructions while retaining requested details. Compare transformed versus sharp references separately. Use optional targeted refinements and editable lettering, with no automatic generation of four images.
