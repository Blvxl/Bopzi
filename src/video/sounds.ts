/**
 * Built-in sound effects for the video editor. Every file in public/sounds/ is listed here with where it came from.
 * Only Creative Commons 0 (public domain) sounds belong in this list: each was checked on its Freesound page,
 * and the files are Freesound's preview MP3s. Do not add sounds from meme soundboard sites.
 */
export type SoundCategory = 'transitions' | 'impacts' | 'cartoon' | 'reactions' | 'rewards' | 'risers';
export type Sound = { id: string; label: string; category: SoundCategory; tags: string[]; duration: number; file: string; source: string; title: string; author: string; licence: 'CC0-1.0' };

/**
 * The creator's own pack in ~/.bopzi/sounds (sound-pack.ts): sound effects in sfx/, music in music/. Not part of
 * the repository and not checked for licences; the creator decides what to publish with them. `main` marks the
 * pack's defaults: the opening sound, and the music to reach for first.
 */
export type OwnSound = { id: string; label: string; kind: 'sfx' | 'music'; file: string; path: string; duration: number; main?: boolean };
let own: OwnSound[] = [];
/** Set once the pack has been read: by the server before checking a timeline, by the editor before opening one. */
export function setOwnSounds(list: OwnSound[]) { own = list; }
export const ownSounds = () => own;
/** Any sound an effect, title or cut can make: built-in or the creator's own effects (never their music). */
export function findSound(id: string | undefined): { id: string; label: string; file: string; own: boolean } | undefined {
  if (!id) return undefined;
  const builtIn = SOUNDS.find(s => s.id === id); if (builtIn) return { id, label: builtIn.label, file: builtIn.file, own: false };
  const mine = own.find(s => s.id === id && s.kind === 'sfx'); return mine && { id, label: mine.label, file: mine.file, own: true };
}
/** Where the browser plays a sound from. */
export const soundUrl = (s: { file: string; own: boolean }) => s.own ? `/api/video/sounds/file?f=${encodeURIComponent(s.file)}` : `/sounds/${s.file}`;

export const SOUND_CATEGORIES: { id: SoundCategory; label: string }[] = [{ id: 'transitions', label: 'Whooshes' }, { id: 'impacts', label: 'Impacts' }, { id: 'cartoon', label: 'Cartoon' }, { id: 'reactions', label: 'Reactions' }, { id: 'rewards', label: 'Rewards' }, { id: 'risers', label: 'Risers' }];

export const SOUNDS: Sound[] = [
  { id: "whoosh", label: "Whoosh", category: "transitions", tags: ["swoosh", "swipe", "fast"], duration: 0.43, file: "whoosh.mp3", source: "https://freesound.org/people/qubodup/sounds/60013/", title: "Whoosh", author: "qubodup", licence: 'CC0-1.0' },
  { id: "quick-woosh", label: "Quick woosh", category: "transitions", tags: ["whoosh", "swoosh", "pass by"], duration: 2.05, file: "quick-woosh.mp3", source: "https://freesound.org/people/florianreichelt/sounds/683101/", title: "quick woosh", author: "florianreichelt", licence: 'CC0-1.0' },
  { id: "swing", label: "Swing", category: "transitions", tags: ["whoosh", "swipe", "sword"], duration: 0.32, file: "swing.mp3", source: "https://freesound.org/people/Jofae/sounds/389590/", title: "Swing Woosh", author: "Jofae", licence: 'CC0-1.0' },
  { id: "rewind", label: "Rewind", category: "transitions", tags: ["tape", "back", "reverse"], duration: 8.05, file: "rewind.mp3", source: "https://freesound.org/people/kasa90/sounds/174363/", title: "Rewind", author: "kasa90", licence: 'CC0-1.0' },
  { id: "boom", label: "Boom", category: "impacts", tags: ["bass", "drop", "hit"], duration: 1.71, file: "boom.mp3", source: "https://freesound.org/people/Snapper4298/sounds/157245/", title: "boom.wav", author: "Snapper4298", licence: 'CC0-1.0' },
  { id: "drama-boom", label: "Drama boom", category: "impacts", tags: ["vine", "bruh", "meme", "reveal"], duration: 3.63, file: "drama-boom.mp3", source: "https://freesound.org/people/modusmogulus/sounds/802074/", title: "Drama Boom 02", author: "modusmogulus", licence: 'CC0-1.0' },
  { id: "cinematic-boom", label: "Cinematic boom", category: "impacts", tags: ["trailer", "bass", "hit"], duration: 7.73, file: "cinematic-boom.mp3", source: "https://freesound.org/people/rhapsodize/sounds/255111/", title: "Cinematic_Boom_Rhapsodize.wav", author: "rhapsodize", licence: 'CC0-1.0' },
  { id: "explosion", label: "Explosion", category: "impacts", tags: ["blast", "boom", "kaboom"], duration: 1.49, file: "explosion.mp3", source: "https://freesound.org/people/deleted_user_364925/sounds/47252/", title: "bad explosion", author: "deleted_user_364925", licence: 'CC0-1.0' },
  { id: "slap", label: "Slap", category: "impacts", tags: ["hit", "punch", "smack"], duration: 1.32, file: "slap.mp3", source: "https://freesound.org/people/njjjjjjjjjjjjjjjjjjjjjjjj/sounds/564230/", title: "Huge Slap in the Face", author: "njjjjjjjjjjjjjjjjjjjjjjjj", licence: 'CC0-1.0' },
  { id: "bonk", label: "Bonk", category: "cartoon", tags: ["hit", "head", "meme"], duration: 2, file: "bonk.mp3", source: "https://freesound.org/people/thecoolcookie17/sounds/573047/", title: "Bonk Sound effect", author: "thecoolcookie17", licence: 'CC0-1.0' },
  { id: "pop", label: "Pop", category: "cartoon", tags: ["bubble", "appear"], duration: 0.65, file: "pop.mp3", source: "https://freesound.org/people/deraj/sounds/202230/", title: "Pop sound", author: "deraj", licence: 'CC0-1.0' },
  { id: "cartoon-pop", label: "Cartoon pop", category: "cartoon", tags: ["pop", "blip"], duration: 0.17, file: "cartoon-pop.mp3", source: "https://freesound.org/people/unfa/sounds/245646/", title: "Cartoon Pop (Distorted)", author: "unfa", licence: 'CC0-1.0' },
  { id: "boing", label: "Boing", category: "cartoon", tags: ["spring", "bounce", "jump"], duration: 2.25, file: "boing.mp3", source: "https://freesound.org/people/reelworldstudio/sounds/161122/", title: "Cartoon Boing.wav", author: "reelworldstudio", licence: 'CC0-1.0' },
  { id: "cartoon-fall", label: "Cartoon fall", category: "cartoon", tags: ["slide whistle", "drop", "fail"], duration: 2.05, file: "cartoon-fall.mp3", source: "https://freesound.org/people/plasterbrain/sounds/395443/", title: "Cartoon Fall", author: "plasterbrain", licence: 'CC0-1.0' },
  { id: "slide-whistle", label: "Slide whistle", category: "cartoon", tags: ["dizzy", "silly"], duration: 1.08, file: "slide-whistle.mp3", source: "https://freesound.org/people/martian/sounds/403002/", title: "classic dizzy take slide whistle.wav", author: "martian", licence: 'CC0-1.0' },
  { id: "sad-trombone", label: "Sad trombone", category: "reactions", tags: ["fail", "wah wah", "lose"], duration: 5.21, file: "sad-trombone.mp3", source: "https://freesound.org/people/kirbydx/sounds/175409/", title: "wah wah sad trombone.wav", author: "kirbydx", licence: 'CC0-1.0' },
  { id: "wrong-buzzer", label: "Wrong buzzer", category: "reactions", tags: ["error", "fail", "incorrect"], duration: 2.77, file: "wrong-buzzer.mp3", source: "https://freesound.org/people/Breviceps/sounds/493163/", title: "Buzzer sounds (Wrong answer / Error)", author: "Breviceps", licence: 'CC0-1.0' },
  { id: "record-scratch", label: "Record scratch", category: "reactions", tags: ["stop", "freeze frame", "wait"], duration: 1.6, file: "record-scratch.mp3", source: "https://freesound.org/people/simkiott/sounds/43404/", title: "record_scratch.wav", author: "simkiott", licence: 'CC0-1.0' },
  { id: "air-horn", label: "Air horn", category: "reactions", tags: ["hype", "mlg", "airhorn"], duration: 1.61, file: "air-horn.mp3", source: "https://freesound.org/people/jacksonacademyashmore/sounds/414208/", title: "Airhorn", author: "jacksonacademyashmore", licence: 'CC0-1.0' },
  { id: "crowd-cheer", label: "Crowd cheer", category: "reactions", tags: ["applause", "win", "yay"], duration: 7.88, file: "crowd-cheer.mp3", source: "https://freesound.org/people/qubodup/sounds/182571/", title: "Short Crowd Cheer.flac", author: "qubodup", licence: 'CC0-1.0' },
  { id: "crowd-woah", label: "Crowd woah", category: "reactions", tags: ["wow", "kids", "amazed"], duration: 4.54, file: "crowd-woah.mp3", source: "https://freesound.org/people/DesignDean/sounds/397317/", title: "kids_WOAH.wav", author: "DesignDean", licence: 'CC0-1.0' },
  { id: "rimshot", label: "Rimshot", category: "reactions", tags: ["joke", "ba dum tss", "drum"], duration: 1.07, file: "rimshot.mp3", source: "https://freesound.org/people/Sajmund/sounds/132418/", title: "Rimshot (sweet)", author: "Sajmund", licence: 'CC0-1.0' },
  { id: "drum-roll", label: "Drum roll", category: "reactions", tags: ["suspense", "reveal"], duration: 5.97, file: "drum-roll.mp3", source: "https://freesound.org/people/adriann/sounds/191718/", title: "drumroll.wav", author: "adriann", licence: 'CC0-1.0' },
  { id: "ding", label: "Ding", category: "rewards", tags: ["idea", "bell", "notification"], duration: 3.36, file: "ding.mp3", source: "https://freesound.org/people/Saya13/sounds/407258/", title: "Ding! idea.mp3", author: "Saya13", licence: 'CC0-1.0' },
  { id: "correct", label: "Correct", category: "rewards", tags: ["right", "success", "ding"], duration: 1.04, file: "correct.mp3", source: "https://freesound.org/people/LittleRainySeasons/sounds/335908/", title: "Correct.mp3", author: "LittleRainySeasons", licence: 'CC0-1.0' },
  { id: "level-up", label: "Level up", category: "rewards", tags: ["power up", "win", "game"], duration: 1.67, file: "level-up.mp3", source: "https://freesound.org/people/qubodup/sounds/442943/", title: "Level Up", author: "qubodup", licence: 'CC0-1.0' },
  { id: "coin", label: "Coin", category: "rewards", tags: ["pickup", "robux", "money"], duration: 0.14, file: "coin.mp3", source: "https://freesound.org/people/Leszek_Szary/sounds/146723/", title: "coin object", author: "Leszek_Szary", licence: 'CC0-1.0' },
  { id: "cash-register", label: "Cash register", category: "rewards", tags: ["cha ching", "money", "buy"], duration: 2.75, file: "cash-register.mp3", source: "https://freesound.org/people/Zott820/sounds/209578/", title: "Cash Register Purchase", author: "Zott820", licence: 'CC0-1.0' },
  { id: "camera-shutter", label: "Camera shutter", category: "rewards", tags: ["photo", "snap", "screenshot"], duration: 0.55, file: "camera-shutter.mp3", source: "https://freesound.org/people/pooky1/sounds/431588/", title: "iPhone Camera Capture.wav", author: "pooky1", licence: 'CC0-1.0' },
  { id: "riser", label: "Riser", category: "risers", tags: ["build up", "tension", "transition"], duration: 3.05, file: "riser.mp3", source: "https://freesound.org/people/syntheffects/sounds/685256/", title: "Riser sound effect short.wav", author: "syntheffects", licence: 'CC0-1.0' },
  { id: "scary-riser", label: "Scary riser", category: "risers", tags: ["horror", "tension", "hit"], duration: 9.6, file: "scary-riser.mp3", source: "https://freesound.org/people/Xinematix/sounds/396161/", title: "Scary Hits & Risers 001", author: "Xinematix", licence: 'CC0-1.0' },
];
