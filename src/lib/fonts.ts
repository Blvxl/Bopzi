import {
  Anton,
  Archivo_Black,
  Barlow_Condensed,
  Bangers,
  Bebas_Neue,
  Black_Ops_One,
  Caveat,
  Comic_Neue,
  Creepster,
  DM_Serif_Display,
  Fredoka,
  Inter,
  League_Spartan,
  Lilita_One,
  Luckiest_Guy,
  Montserrat,
  Orbitron,
  Oswald,
  Playfair_Display,
  Poppins,
  Permanent_Marker,
  Press_Start_2P,
  Righteous,
  Roboto,
  Sora,
  Space_Grotesk,
  Titan_One,
  Unbounded,
} from 'next/font/google';

// Brand fonts
export const sora = Sora({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-sora', display: 'swap' });
export const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

// Thumbnail fonts, only fetched once the studio asks for them
const luckiest = Luckiest_Guy({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const titan = Titan_One({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const lilita = Lilita_One({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const bangers = Bangers({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const fredoka = Fredoka({ subsets: ['latin'], weight: '700', preload: false, display: 'swap' });
const anton = Anton({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const bebas = Bebas_Neue({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const creepster = Creepster({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const pressStart = Press_Start_2P({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const marker = Permanent_Marker({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
// The two faces hand-made Roblox thumbnails lean on: a bold comic hand for callouts and numbers, and a heavy
// geometric sans for the game's own interface (key prompts, buttons).
const comic = Comic_Neue({ subsets: ['latin'], weight: '700', preload: false, display: 'swap' });
const montserrat = Montserrat({ subsets: ['latin'], weight: '800', preload: false, display: 'swap' });
// Additional display, editorial and clean sans faces help the editor and the AI match a wider range of references.
const archivo = Archivo_Black({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const barlow = Barlow_Condensed({ subsets: ['latin'], weight: '800', preload: false, display: 'swap' });
const blackops = Black_Ops_One({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const caveat = Caveat({ subsets: ['latin'], weight: '700', preload: false, display: 'swap' });
const dmserif = DM_Serif_Display({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const league = League_Spartan({ subsets: ['latin'], weight: '700', preload: false, display: 'swap' });
const orbitron = Orbitron({ subsets: ['latin'], weight: '700', preload: false, display: 'swap' });
const oswald = Oswald({ subsets: ['latin'], weight: '700', preload: false, display: 'swap' });
const playfair = Playfair_Display({ subsets: ['latin'], weight: '700', preload: false, display: 'swap' });
const poppins = Poppins({ subsets: ['latin'], weight: '800', preload: false, display: 'swap' });
const righteous = Righteous({ subsets: ['latin'], weight: '400', preload: false, display: 'swap' });
const roboto = Roboto({ subsets: ['latin'], weight: '700', preload: false, display: 'swap' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: '700', preload: false, display: 'swap' });
const unbounded = Unbounded({ subsets: ['latin'], weight: '800', preload: false, display: 'swap' });

export type EditorFont = { key: string; label: string; family: string; weight: string };

export const EDITOR_FONTS: EditorFont[] = [
  { key: 'luckiest', label: 'Luckiest Guy', family: luckiest.style.fontFamily, weight: '400' },
  { key: 'titan', label: 'Titan One', family: titan.style.fontFamily, weight: '400' },
  { key: 'lilita', label: 'Lilita One', family: lilita.style.fontFamily, weight: '400' },
  { key: 'fredoka', label: 'Fredoka Bold', family: fredoka.style.fontFamily, weight: '700' },
  { key: 'comic', label: 'Comic Bold', family: comic.style.fontFamily, weight: '700' },
  { key: 'montserrat', label: 'Montserrat ExtraBold', family: montserrat.style.fontFamily, weight: '800' },
  { key: 'bangers', label: 'Bangers', family: bangers.style.fontFamily, weight: '400' },
  { key: 'anton', label: 'Anton', family: anton.style.fontFamily, weight: '400' },
  { key: 'bebas', label: 'Bebas Neue', family: bebas.style.fontFamily, weight: '400' },
  { key: 'sora', label: 'Sora ExtraBold', family: sora.style.fontFamily, weight: '800' },
  { key: 'inter', label: 'Inter Bold', family: inter.style.fontFamily, weight: '700' },
  { key: 'creepster', label: 'Creepster', family: creepster.style.fontFamily, weight: '400' },
  { key: 'marker', label: 'Permanent Marker', family: marker.style.fontFamily, weight: '400' },
  { key: 'pressstart', label: 'Press Start 2P', family: pressStart.style.fontFamily, weight: '400' },
  { key: 'archivo', label: 'Archivo Black', family: archivo.style.fontFamily, weight: '400' },
  { key: 'barlow', label: 'Barlow Condensed ExtraBold', family: barlow.style.fontFamily, weight: '800' },
  { key: 'blackops', label: 'Black Ops One', family: blackops.style.fontFamily, weight: '400' },
  { key: 'caveat', label: 'Caveat Bold', family: caveat.style.fontFamily, weight: '700' },
  { key: 'dmserif', label: 'DM Serif Display', family: dmserif.style.fontFamily, weight: '400' },
  { key: 'league', label: 'League Spartan Bold', family: league.style.fontFamily, weight: '700' },
  { key: 'orbitron', label: 'Orbitron Bold', family: orbitron.style.fontFamily, weight: '700' },
  { key: 'oswald', label: 'Oswald Bold', family: oswald.style.fontFamily, weight: '700' },
  { key: 'playfair', label: 'Playfair Display Bold', family: playfair.style.fontFamily, weight: '700' },
  { key: 'poppins', label: 'Poppins ExtraBold', family: poppins.style.fontFamily, weight: '800' },
  { key: 'righteous', label: 'Righteous', family: righteous.style.fontFamily, weight: '400' },
  { key: 'roboto', label: 'Roboto Bold', family: roboto.style.fontFamily, weight: '700' },
  { key: 'spacegrotesk', label: 'Space Grotesk Bold', family: spaceGrotesk.style.fontFamily, weight: '700' },
  { key: 'unbounded', label: 'Unbounded ExtraBold', family: unbounded.style.fontFamily, weight: '800' },
];

export const fontOf = (key: string) => EDITOR_FONTS.find((f) => f.key === key) ?? EDITOR_FONTS[0];

/** Canvas text only picks up a web font after the browser has fetched it. */
export function loadEditorFonts() {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return Promise.allSettled(EDITOR_FONTS.map((f) => document.fonts.load(`${f.weight} 64px ${f.family}`))).then(
    () => undefined,
  );
}
