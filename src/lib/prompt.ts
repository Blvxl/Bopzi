import type { PromptState } from './types';

type Option = { id: string; label: string; prompt: string };

export const GENRES: Option[] = [
  {
    id: 'simulator',
    label: 'Simulator',
    prompt:
      'a bright, saturated world packed with collectibles: coin piles, gems, eggs, upgrade zones and far-off islands that hint at progression',
  },
  {
    id: 'obby',
    label: 'Obby',
    prompt:
      'a floating obstacle course stretching into the distance: colour-coded platforms, checkpoints, lava and spinning hazards, with a real sense of height',
  },
  {
    id: 'horror',
    label: 'Horror',
    prompt:
      'an unsettling location such as a dim corridor, abandoned facility or foggy forest, where the threat is implied by light and shadow instead of shown',
  },
  {
    id: 'tycoon',
    label: 'Tycoon',
    prompt:
      'a growing base or factory with conveyors, droppers, cash stacks and half-built upgrades that show the climb from small to huge',
  },
  {
    id: 'rpg',
    label: 'RPG',
    prompt:
      'an adventure landscape with a distant castle or boss arena, a winding path, glowing loot and a sky that sets the mood of the quest',
  },
  {
    id: 'fighting',
    label: 'Fighting',
    prompt:
      'an arena mid-battle with cracked ground, energy trails, flying debris and impact dust, all pushing in one strong direction',
  },
  { id: 'other', label: 'Other', prompt: 'an environment that clearly shows where the game takes place' },
];

export const STYLES: Option[] = [
  {
    id: 'render',
    label: 'Cinematic 3D render',
    prompt:
      'high-end 3D GFX render in the manner of professional Roblox thumbnail artists: path-traced lighting, soft global illumination, believable materials on blocky geometry, gentle depth of field in the far distance',
  },
  {
    id: 'cartoon',
    label: 'Bright cartoon',
    prompt:
      'bold, clean, saturated cartoon render with smooth plastic materials, rounded bevels, simple readable shapes and a cheerful toy-like finish',
  },
  {
    id: 'dark',
    label: 'Dark and moody',
    prompt:
      'low-key cinematic render with deep shadows, heavy atmosphere, desaturated colour and a few small, intense light sources',
  },
  {
    id: 'anime',
    label: 'Anime action',
    prompt:
      'stylised cel-shaded look with painted clouds, dramatic sky, speed lines and exaggerated energy effects',
  },
  {
    id: 'lowpoly',
    label: 'Clean low-poly',
    prompt: 'crisp low-poly build with flat-shaded facets, tidy silhouettes, soft ambient occlusion and a limited palette',
  },
  {
    id: 'neon',
    label: 'Neon night',
    prompt: 'night scene with glossy reflective surfaces, glowing neon edges, light bloom and wet-floor reflections',
  },
];

export const COMPOSITIONS: Option[] = [
  { id: 'wide', label: 'Wide establishing shot', prompt: 'wide establishing shot that shows the whole location, horizon around the upper third' },
  { id: 'low', label: 'Low hero angle', prompt: 'low camera looking slightly upward so the scene towers over the viewer' },
  { id: 'high', label: 'High three-quarter view', prompt: 'elevated three-quarter view looking down across the map so the layout reads at a glance' },
  { id: 'symmetric', label: 'Centred and symmetrical', prompt: 'symmetrical one-point perspective with strong leading lines running to the centre' },
  { id: 'diagonal', label: 'Diagonal action', prompt: 'tilted, dynamic framing with strong diagonals running corner to corner' },
  { id: 'tunnel', label: 'Depth tunnel', prompt: 'foreground elements framing the edges, with a clear path leading deep into the scene' },
];

export const PLACEMENTS: Option[] = [
  { id: 'right', label: 'Character on the right', prompt: 'the right third of the frame' },
  { id: 'left', label: 'Character on the left', prompt: 'the left third of the frame' },
  { id: 'center', label: 'Character in the centre', prompt: 'the centre of the frame, from the lower edge up to about two-thirds height' },
  { id: 'duo', label: 'Two characters, left and right', prompt: 'both the left and right thirds of the frame, with the focal point of the scene between them' },
];

export const PALETTES: Option[] = [
  { id: 'warm', label: 'Warm: orange, gold, red', prompt: 'warm oranges, golds and reds with deep brown shadows' },
  { id: 'cool', label: 'Cool: cyan, blue, violet', prompt: 'cyan, electric blue and violet with near-black navy shadows' },
  { id: 'contrast', label: 'Blue against orange', prompt: 'a blue-versus-orange complementary scheme, one colour dominant and the other used as the accent' },
  { id: 'toxic', label: 'Toxic: green and purple', prompt: 'acid green and deep purple with dark, murky shadows' },
  { id: 'candy', label: 'Candy pastel', prompt: 'soft pastel pinks, mints, sky blues and creamy whites' },
  { id: 'mono', label: 'Dark with one accent', prompt: 'an almost monochrome dark scheme with a single saturated accent colour' },
  { id: 'custom', label: 'My own colours', prompt: '' },
];

export const LIGHTING: Option[] = [
  { id: 'golden', label: 'Golden hour rim light', prompt: 'low golden-hour sun from behind, giving strong warm rim light and long shadows' },
  { id: 'rays', label: 'Volumetric light rays', prompt: 'visible volumetric light shafts cutting through haze from a single bright source' },
  { id: 'neon', label: 'Neon glow', prompt: 'coloured light from glowing signs and emissive blocks, with bloom and coloured bounce light' },
  { id: 'fog', label: 'Moody fog', prompt: 'dim, diffused light swallowed by thick fog, with one or two small practical lights' },
  { id: 'day', label: 'Bright daylight', prompt: 'clear midday sun, crisp shadows, blue sky and high overall brightness' },
  { id: 'under', label: 'Fire or lava underlight', prompt: 'hot light from below, as if from lava or fire, against a darker sky' },
];

export const TEXT_SPACES: Option[] = [
  { id: 'top', label: 'Keep the top clear for a title', prompt: 'Keep the top quarter of the image calm and low in detail so a title can sit there.' },
  { id: 'bottom', label: 'Keep the bottom clear for a title', prompt: 'Keep the bottom quarter of the image calm and low in detail so a title can sit there.' },
  { id: 'side', label: 'Keep the opposite side clear', prompt: 'Keep the side opposite the character space calm and low in detail so a title can sit there.' },
  { id: 'none', label: 'No title space needed', prompt: '' },
];

export const defaultPrompt = (genre = 'simulator'): PromptState => ({
  game: '',
  genre: GENRES.some((g) => g.id === genre) ? genre : 'simulator',
  idea: '',
  style: 'render',
  hook: 'scene',
  composition: 'wide',
  placement: 'right',
  palette: 'contrast',
  customColors: '',
  lighting: 'golden',
  textSpace: 'top',
  extra: '',
});

const pick = (list: Option[], id: string) => list.find((o) => o.id === id) ?? list[0];

export function buildPrompt(p: PromptState) {
  const genre = pick(GENRES, p.genre);
  const colours =
    p.palette === 'custom' && p.customColors.trim() ? p.customColors.trim() : pick(PALETTES, p.palette === 'custom' ? 'contrast' : p.palette).prompt;
  const textSpace = pick(TEXT_SPACES, p.textSpace).prompt;
  const game = p.game.trim();
  const idea = p.idea.trim();
  const kind = genre.id === 'other' ? 'game' : `${genre.label.toLowerCase()} game`;

  const lines = [
    'Create a background image for a Roblox game thumbnail. Landscape, 16:9, as large as you can make it (target 1920 × 1080).',
    '',
    `The game: ${game ? `"${game}", a` : 'A'} Roblox ${kind}.${idea ? ` ${idea}` : ''}`,
    '',
    `Scene: ${genre.prompt}. Build the world from Roblox-style blocky parts, studs and simple props so it matches how the game looks in play.`,
    `Art direction: ${pick(STYLES, p.style).prompt}.`,
    `Camera and composition: ${pick(COMPOSITIONS, p.composition).prompt}.`,
    `Colour: ${colours}.`,
    `Lighting: ${pick(LIGHTING, p.lighting).prompt}.`,
    '',
    `Character space: leave ${pick(PLACEMENTS, p.placement).prompt} open. I will place my own Roblox character render there afterwards, so keep that area free of key details and let the lighting and leading lines point towards it.`,
  ];
  if (textSpace) lines.push(textSpace);
  if (p.extra.trim()) lines.push('', `Also: ${p.extra.trim()}`);
  lines.push(
    '',
    'Rules:',
    '- Environment only. No characters, avatars, people or creatures.',
    '- No text, letters, numbers, logos, UI elements, watermarks, frames or borders.',
    '- Fill the frame edge to edge with no letterboxing.',
    '- Sharp focus in the foreground and midground, with clean, readable shapes.',
  );
  return lines.join('\n');
}
