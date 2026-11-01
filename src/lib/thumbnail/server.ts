import { posePick, refinePrompt, thumbnailPrompt, type ThumbnailBrief, type ThumbnailRefine } from './prompt';
import { poseGuide } from './pose';
import { styleReferenceImage } from './references';
import { styleNotes } from './style';
import { codexAccount, codexCancelSignIn, codexImage, codexPicture, codexSignIn, codexSignOut, codexStatus } from '../../../helper/codex-core.mjs';
export { thumbnailPrompt, type ThumbnailBrief, type ThumbnailRefine } from './prompt';

// Images are made by the Codex app on this computer, on the plan it is signed in with.
// Bopzi asks Codex for the image and reads the file it produces; it never opens the sign-in itself.

/** A request with everything decided: the words, the images in order, and the shape. */
export type Prepared = { prompt: string; images: string[]; shape: 'wide' | 'square'; /** Shown to the reader of the brief, never to the image tool. */ look?: string[]; /** A question answered in a file beside the image. */ notes?: string };

export const connectionStatus = codexStatus;
/** Works out the full request for a brief, without generating anything. */
export async function prepareThumbnail(brief: ThumbnailBrief): Promise<Prepared> {
  const images = [...brief.references];
  const styleImage = brief.styleReferenceId ? await styleReferenceImage(brief.styleReferenceId) : brief.styleReference;
  let measuredStyle: string | undefined;
  if (styleImage) {
    images.push(styleImage);
    // Measuring and drawing need the image library, which some hosts (Cloudflare) cannot run. Without it the
    // request simply goes without the measured look and the pose guide, and the prompt stops mentioning them.
    measuredStyle = await styleNotes(styleImage).catch(() => undefined);
  }
  const pose = posePick(brief);
  const guide = pose ? await poseGuide(pose).catch(() => null) : null;
  if (guide) images.push(guide);
  const effective = pose && !guide ? { ...brief, pose: 'none' } : brief;
  return { prompt: thumbnailPrompt(effective, measuredStyle), images, shape: brief.icon ? 'square' : 'wide' };
}

/** Changes one thing in an existing result. The current image is the only input, so the composition carries over. */
export function prepareRefine(refine: ThumbnailRefine): Prepared {
  const extras = refine.references ?? [];
  return { prompt: refinePrompt(refine.instruction, refine.region, refine.icon, extras.map((r) => r.label)), images: [refine.image, ...extras.map((r) => r.data)], shape: refine.icon ? 'square' : 'wide' };
}

/** The signed-in account for this computer's own pages. The helper does not offer this. */
export const connectedAccount = () => codexAccount();
export const connectedPicture = () => codexPicture();
export const signIn = () => codexSignIn();
export const cancelSignIn = () => codexCancelSignIn();
export const signOut = () => codexSignOut();

/** `cancel` is the browser request's signal: when the user cancels, the work behind it stops too. */
export async function makeImage(job: Prepared, cancel?: AbortSignal, onScene?: (scene: string) => void) {
  return codexImage({ prompt: job.prompt, images: job.images, look: job.look, notes: job.notes, shape: job.shape, signal: cancel, onScene });
}
