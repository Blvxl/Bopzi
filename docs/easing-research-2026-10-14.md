# Easing research and implementation

Researched 14 October 2026 for Roblox edits in Bopzi.

## Findings

[CapCut's keyframe guide](https://www.capcut.com/resource/how-to-add-keyframes-in-capcut) recommends ease-in/ease-out, previewing frequently, and refining the spacing of keyframes. Its [keyframe tool page](https://www.capcut.com/tools/keyframe-animation) describes animating properties such as position and scale. These establish the workflow reference; they do not establish a single identical preset catalogue across CapCut platforms or disclose proprietary curve coefficients.

The [W3C easing specification](https://www.w3.org/TR/css-easing-1/) defines input progress mapped to output progress, including cubic Bézier curves. [MDN's Bézier reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/easing-function/cubic-bezier) explains the two control handles, bounded x coordinates and y values that can create overshoot. A Bézier easing must solve x(t) for time before evaluating y(t); directly treating the curve parameter t as time gives the wrong motion.

## Added to Bopzi

The picker offers 17 named curves plus a custom Bézier curve. These are Bopzi's curve choices, inspired by that authoring workflow, rather than a claim to duplicate CapCut's proprietary presets.

| Family | Styles | Use |
|---|---|---|
| Basic | Linear, Ease in, Ease out, Smooth | Predictable motion and existing projects |
| Gentle | Gentle in, Gentle out, Gentle S, Silky S | Cinematic push-ins and restrained numeric animation |
| Strong | Strong S, Sharp S, Rush in, Snap out, Impact S, Circular S | Fast Roblox reveals and impact moments |
| Playful | Overshoot, Spring, Bounce | Camera zooms that settle into their target |
| Custom | Two Bézier handles, draggable or numeric | User-defined acceleration and slowdown |

Curves apply to counter values and camera zoom push-ins, including punch-and-return zooms. Counter presets omit the three non-monotonic playful curves; number values stay within their range, while the existing appearance bounce can animate the text separately. Counter custom controls are constrained to a monotonic curve. Camera custom controls allow positive overshoot up to a control y of 1.5. Motion easing changes the animated property, not playback speed of the footage.

The picker includes curve thumbnails, an animated graph and a moving marker. Reduced-motion preferences disable the looping demo. Custom curves and selected styles survive project validation, saving and reopening. The AI prompt documents the same accepted styles and custom coordinates.

## Rendering and compatibility

- Named curves use a shared expression tree for numeric evaluation and FFmpeg expression generation.
- Custom curves solve the cubic Bézier and sample it into 64 linear segments; both renderers interpolate the same table. This is a shared approximation of the mathematical curve, not an exact analytic inverse in FFmpeg.
- Existing Smooth retains smoothstep; existing counter Ease out retains its quartic curve, while zoom Ease out retains cubic. The picker previews the correct variant for its context.
- Existing punch zooms preserve their established return curve. Picking a new style changes their push-in.
- Fixed the perspective filter's one-based input frame index: frame time is `(in-1)/30`. Punch effects stop at the same exclusive endpoint as the preview; held framing follows the editor’s held-zoom chain.
- Custom and stacked camera expressions can exceed Windows command-line limits. Segment filter graphs now load from temporary files through FFmpeg's documented [`-/filter:v` syntax](https://ffmpeg.org/ffmpeg.html#Options).

## Validation

Tests cover exact endpoints, finite curve samples, monotonic styles, preserved legacy values, custom time inversion, validation and save round-trips. Every style is rendered with the actual FFmpeg perspective filter on a gradient clip, with sampled pixels compared against preview camera evaluation, including the ramp, held framing and punch effect endpoint.

The implementation does not add a general keyframe editor or new easing controls for title/logo transforms. Those remain separate follow-up work.
