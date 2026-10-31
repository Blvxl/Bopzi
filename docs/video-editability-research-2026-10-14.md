# Making Bopzi's AI edits editable and polished

Research: 14 October 2026. Scope: current source inspection plus first-party editor documentation. Recommendations below are product proposals, not implemented features. Documentation establishes supported workflows; no comparative hands-on quality benchmark was performed.

## What the current code explains

- `VideoEditor.tsx` renders counters as effects, but `boxOf` and `hitAt` only handle captions, titles and overlays. Counters therefore cannot be selected directly in the preview. The drag handler also omits counter positions.
- `showItem` selects a timeline item but opens its properties only if a drawer was already open. A successful selection can therefore appear to do nothing.
- Counter properties already include start/end values, prefix/suffix, format, typography, position and timing. The immediate problem is access and control, rather than a complete absence of editable data.
- `motion.ts` forces quartic ease-out, a 0.45-second final hold, entrance/exit animation and a landing swell. Counting time and visibility time are coupled. There is no independent choice of linear/eased counting, decimal precision, step, padding or animation-free presentation.
- `layers.ts` anchors text using the final value's width. That helps stabilize its right edge, but is not a digit-wheel renderer and does not ensure equal-width digits. Calling the result an odometer would overstate the implementation.
- Effects occupy a shared timeline lane. Concurrent effects can overlap and become difficult to target, especially in the compact story view.
- AI results already have a summary, changed-item marking and Keep/Undo. Improve these existing mechanisms with direct links to changed layers rather than adding a second review system.

## Relevant references

| Reference | Documented workflow | Bopzi lesson |
|---|---|---|
| [CapCut text editing](https://www.capcut.com/help/edit-the-text) | Select text on the canvas or timeline, then edit its properties. | Both selection paths must reach the same inspector, regardless of whether AI or a human created the element. |
| [Jitter layers](https://help.jitter.video/en/articles/14037746-manage-your-layers) | Layers and their editable properties form the authoring model. | Give every element a persistent identity and a discoverable place in a layer list. |
| [Jitter counters](https://help.jitter.video/en/articles/15273397-create-a-counter-animation) | A counter is an animation on a text layer, with From, To and Step. Formats include decimals, separators, prefixes/suffixes and zero padding. | A counter should feel like editable text with numeric animation, not an opaque effect. |
| [Jitter custom animations](https://help.jitter.video/en/articles/14136797-create-custom-animations) | Configurable animation operations, easing and reusable animations. | Separate a reusable preset from the individual parameters that users can adjust. |
| [CapCut keyframes](https://www.capcut.com/tools/keyframe-animation) | Keyframed properties and speed curves. | Make time and motion directly inspectable, with simple controls before an advanced curve editor. |
| [Premiere graphic groups](https://helpx.adobe.com/premiere/desktop/add-text-images/insert-images-and-graphics/group-text-and-graphic-layers.html) | Group related text and graphic layers. | A Roblox reward card can move as one unit while its number, icon and label remain individually editable. |
| [Descript changelog](https://feedback.descript.com/changelog) | A visible Revert action below an AI response. | Keep undo close to the AI result and make the affected objects easy to find. |

## Recommended order

### 1. Complete selection and inspection

Every visible graphic gets click selection, an accurate bounding box, drag positioning, resize handles and an automatically opened inspector. Hit-testing must use the same current transforms and stacking order as drawing. A counter needs a stable selection area while its digits animate; changing values must not make it impossible to grab.

Add a searchable layer list with names, visibility, lock, duplicate and delete. Selecting a hidden-in-time item should offer Jump to item. Make overlapping timeline items individually accessible. This is the highest-priority work because it makes every subsequent feature usable.

Acceptance: ask AI for a counter, click the number, change its target and colour, drag it, resize it, undo and reload. All actions must work without another prompt.

### 2. Rebuild counter controls around explicit timing

Keep a counter's numeric meaning separate from its appearance:

- Values: From, To, integer/decimal precision, step, separators, padding, prefix and suffix.
- Timing: layer start/end, counting start/end, final hold, entrance and exit. Trimming visibility should not silently change counting speed.
- Motion: linear, ease-out or ease-in-out counting; optional pop/bounce. Default to a clean, restrained animation.
- Appearance: typeface, size, outline, shadow, alignment, colour, background and optional currency icon.
- Number layout: fixed-width digit slots or a suitable tabular-number font. Keep labels/icons anchored independently of changing digit length.

Offer three deliberate styles: clean count, slot-machine roll, and impact/reward. A true rolling style needs per-digit transitions with correct carries; merely swapping a rounded whole string is a different effect.

Example: `0 → 10,000` from 0.2s to 1.4s, hold until 3s, Robux icon at left. Editing the target to 25,000 preserves placement, styling and timing. Scrubbing backward must reproduce the correct number, and export must match preview.

### 3. Let AI operate on the user's selection

Send selected IDs, playhead, selected time range and active clip bounds as explicit context. Show a scope chip such as Selected counter or Current clip. “Make this slower” changes the selected counter's counting interval; “change to 50K” changes its target without regenerating the layout.

Prefer validated operations such as updateCounter(id, patch) over replacing the entire timeline. Preserve IDs and untouched properties. Summaries should link to changed elements: Counter · 0–3s · Edit. For larger edits, support reverting one operation as well as the full request.

### 4. Make timing and motion easy to refine

Add animation strips with draggable start/end handles, snapping to the playhead, frame stepping and clip-boundary snapping. Begin with position, scale, opacity and numeric value keyframes. Add an advanced curve editor after basic interaction is reliable. Attach effects to clips where intended, so reordering or trimming a clip does not strand its effects elsewhere.

### 5. Add Roblox recipes built from editable parts

Prioritize a reward/Robux reveal, kill or win counter, rare-drop card, before/after upgrade and trailer title/end card. Each recipe groups native text, graphics, sound cues and motion. Include a clean version as well as an energetic one. Let users replace one part without rebuilding the recipe.

Then add beat markers, waveform-guided cuts, sound alignment and independent music/gameplay/SFX gain. These support montage finishing. Subject tracking and automatic highlight detection are later projects with substantially greater uncertainty; a manually placed zoom target should remain available.

## Implementation direction

Evolve the existing shared preview/export layer evaluation instead of introducing a separate animation renderer solely for counters. Derive drawing, selection bounds and handles from a common evaluated layer description. Keep motion deterministic at a given time. Introduce selection support before a large project-schema migration; counters can remain stored as effects initially while behaving consistently with text layers in the UI.

Verify real outcomes: AI-create → manual edit → save/reload → export; counters crossing 999/1,000 and negative values; overlapping elements; trim/reorder; reverse seeking; and preview/export matching at animation boundaries. The immediate success criterion is that a user can fix what the AI made in seconds.
