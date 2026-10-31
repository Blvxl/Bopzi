# Bopzi website and first-use design research — 31 October 2026

## Scope
Observed the local Bopzi home, empty thumbnail studio and empty video studio at a desktop viewport (~1280×720) in an isolated in-app browser. This is a first-use design critique, not a user study or a mobile/accessibility audit. Existing projects in another browser are not reflected. Compared public product positioning and design guidance from Canva, Penpot, Fluent, Nielsen Norman Group and W3C; did not test competitors' authenticated editors.

## What is happening now

- Home has a narrow icon sidebar, heading “New”, and three flat, equal-weight text cards: Video, Thumbnail and Game icon. In this fresh browser the rest of the page is blank. It functions as a launcher but barely communicates the product, its audience, what results look like, or how to get started. The empty space gives little visual personality. This is a visual/design judgment, not proof of poor conversion.
- Thumbnail first use is centered around a prompt and a large “Borrow the look of a hit” reference gallery. The colourful reference gallery dominates over Bopzi's own work, while editing without AI and connection requirements are not obvious from this initial view. Choosing a reference is optional; the UI should make that clear.
- Video opens a dark dense editor with an empty timeline, central onboarding card and large prompt composer. At the observed height the composer overlaps/obscures the lower part of the onboarding card's button row. That is a specific desktop layout issue to fix. Features and icons appear before the user has media, while the CTA is hidden behind another panel.
- Sidebar labels are small and muted. Contrast and hit targets should be measured, not declared noncompliant from a screenshot alone.

## Research and implications

- Microsoft Fluent recommends contextual onboarding and empty states with a clear way forward: https://fluent2.microsoft.design/onboarding. Nielsen Norman Group describes empty states as opportunities to explain state and direct the next task: https://www.nngroup.com/articles/empty-state-interface-design/.
- Canva's video-editor page shows a clear task (“video editor”) and demonstrates creating/editing rather than relying on a blank dashboard: https://www.canva.com/video-editor/. Bopzi can use actual product previews and accurate sample work, not competitor claims or fake product screens.
- Penpot makes its open-source identity and self-host option explicit and links design and community resources: https://penpot.app/. Bopzi should describe its real platform support and local workflow; it must not imply cloud sync or a no-install hosted product.
- WCAG 2.2 provides measurable targets for contrast, visible focus, reflow and control sizing: https://www.w3.org/TR/WCAG22/. Validate against computed styles and keyboard interaction; no compliance conclusion has been made.

## Recommended direction: Creator's desk

A warm, energetic creative workspace aimed at Roblox creators: charcoal surfaces with visible hierarchy, off-white text, a restrained coral accent carried from the logo, generous spacing and authentic colourful artwork. The user's art supplies the colour; use vivid accents intentionally on primary actions and selected states. Use one clear type scale, consistent radii and a shared icon/button system. Avoid cloning another product.

### Home
Create a simple headline such as “Make something for your game.” Add one line explaining video, thumbnails and icons. Use three cards with real sample previews, clearer action labels, and one restrained accent. Add a recent-projects section populated from local data, with a useful empty state and an explicit sample. Include a small “Open source · Runs on your computer” explanation only when accurate, and links to documentation/source once a real public URL exists. No fabricated community proof, supported-platform claims or download button.

### Thumbnail start
Offer equal first-step choices: “Generate with AI,” “Start from a screenshot,” and “Blank canvas.” Show a small, honest example of a Bopzi-created result; demote inspiration to an optional, collapsible picker after the task is clear. Show connection status near AI generation and explain it when unavailable. Preserve all existing manual and reference workflows.

### Video start
Keep the actual preview and timeline, but let a lightweight empty state own the workspace until media exists. Make “Add gameplay” prominent with “Explore sample” secondary; remove overlap with the prompt at shorter heights. Move the AI composer and advanced controls into their normal working positions once they are relevant. Keep manual editing and AI paths visible and honest.

### Navigation and interaction
Readable sidebar labels with obvious active state; consistent navigation between home, projects and editors. Improve text contrast, focus rings and target size; verify keyboard operation. Make hover, selected, loading and error states legible. Define breakpoints and test narrow screens rather than scaling a desktop workspace blindly. Respect reduced motion.

## Suggested order
1. Fix the confirmed video onboarding/composer overlap.
2. Redesign first-use home and empty states using real Bopzi examples and clear actions.
3. Rework thumbnail entry so manual creation and optional inspiration are discoverable.
4. Unify shell, typography, spacing, controls, colour and motion tokens across editors.
5. Test 1280×720, 1440×900 and 390×844, keyboard focus and contrast; run a short first-use test with real creators.

No site implementation was changed during this research. Check artifact rights before reusing assets in a public release.

## Roblox generator comparison and follow-up
RoThumbnail (https://rothumbnail.com/) puts a prompt, image attachment, output format and generate action together beneath top navigation. VizzBees (https://vizzbees.com/) uses top navigation, a central description field and asset selectors. ATDCreate (https://atdcreate.com/) describes reference-led and conversational editing. Observations are of public pages, not a comparative generation test. The user rejected the vertical sidebar. Bopzi now uses a compact top navigation; the thumbnail flow shows the prompt and manual starting paths with optional inspiration. Video is hidden and old pages redirect, while code and project data are retained. The home and initial editor were checked visually; desktop screenshot and blank canvas paths were opened, and mobile was checked before the final navigation change. Typecheck and production build passed; existing video tracing warnings remain.
