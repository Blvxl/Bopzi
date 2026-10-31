import { posePick, refinePrompt, thumbnailPrompt, type ThumbnailBrief, type ThumbnailRefine } from './prompt';
import { poseGuide } from './pose';
import { styleReferenceImage } from './references';
import { styleNotes } from './style';
import { codexAccount, codexImage, codexPicture, codexStatus } from '../../../helper/codex-core.mjs';
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
  let notes: string | undefined;
  if (styleImage) {
    images.push(styleImage);
    notes = await styleNotes(styleImage);
  }
  const pose = posePick(brief);
  if (pose) images.push(await poseGuide(pose));
  return { prompt: thumbnailPrompt(brief, notes), images, shape: brief.icon ? 'square' : 'wide' };
}

/** Changes one thing in an existing result. The current image is the only input, so the composition carries over. */
export function prepareRefine(refine: ThumbnailRefine): Prepared {
  return { prompt: refinePrompt(refine.instruction, refine.region, refine.icon), images: [refine.image], shape: refine.icon ? 'square' : 'wide' };
}

/** The signed-in account for this computer's own pages. The helper does not offer this. */
export const connectedAccount = () => codexAccount();
export const connectedPicture = () => codexPicture();

/** `cancel` is the browser request's signal: when the user cancels, the work behind it stops too. */
export async function makeImage(job: Prepared, cancel?: AbortSignal, onScene?: (scene: string) => void) {
  return codexImage({ prompt: job.prompt, images: job.images, look: job.look, notes: job.notes, shape: job.shape, signal: cancel, onScene });
}
