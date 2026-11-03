// Reads a game's name and description and says what kind of game it is, what it is about, what it has in it, which brand or
// show it is built on, what it sells and which language it is written in. This is plain word matching, so it is cruder than
// an AI reading of the same text; its results are labelled that way on the site. Swapping in an AI model later only means
// replacing `tag`, because everything else works from the lists it returns.

const rules = (list) => list.map(([tag, re]) => [tag, re]);

const TYPES = rules([
  ['Simulator', /simulator|\bsim\b/], ['Tycoon', /tycoon/], ['Obby', /\bobby\b|obstacle course|parkour/],
  ['Tower defense', /tower defen[cs]e|\btd\b/], ['RPG', /\brpg\b|role[- ]?playing game|\blevel up\b/],
  ['Fighting', /fighting|\bpvp\b|battlegrounds|combat|\bduel/], ['Horror', /horror|scary|haunted|nightmare|backrooms|survive the night/],
  ['Survival', /\bsurviv/], ['Roleplay', /role[- ]?play|\brp\b|hangout|life sim/], ['Racing', /racing|\brace\b|drift|\brally\b|\bkart\b/],
  ['Shooter', /shooter|\bfps\b|\bguns?\b|sniper|warfare/], ['Clicker', /clicker|\bclick\b/], ['Idle', /\bidle\b/],
  ['Farming', /\bfarm/], ['Fishing', /\bfish(ing)?\b/], ['Party', /\bparty\b|mini-?games?/], ['Puzzle', /puzzle|escape room|\bescape\b/],
  ['Sports', /soccer|football|basketball|baseball|volleyball|tennis|\bgolf\b|\bsports?\b|hockey/], ['Trading', /\btrad(e|ing)\b/],
  ['Brainrot', /brainrot|\bsteal an?\b|skibidi|rizz/], ['Hide and seek', /hide (and|&|n) seek|\bhide\b/], ['Adventure', /adventure|\bquest/],
  ['Building', /\bbuild(ing)?\b/], ['Dress up', /dress[- ]?up|fashion|outfit|runway/], ['Cooking', /\bcook|restaurant|bakery|pizza|burger/],
  ['Driving', /driving|\bdrive\b|\btruck|\bbus\b|\btaxi/], ['Mining', /\bmin(e|ing)\b|\bdig\b/], ['Pet collecting', /\bpets?\b|\begg(s)?\b|hatch/],
]);

const THEMES = rules([
  ['Anime', /anime|manga|\bnaruto|one piece|jujutsu|demon slayer|dragon ball|bleach/], ['Halloween', /halloween|spooky|pumpkin|🎃|trick or treat/],
  ['Christmas', /christmas|\bxmas\b|santa|🎄|winter wonderland/], ['Winter', /\bwinter|\bsnow|\bice\b|frozen/], ['Summer', /\bsummer|beach|🏖|surf/],
  ['Cars', /\bcars?\b|vehicle|supercar|racing|garage/], ['Pets', /\bpets?\b|\bcats?\b|\bdogs?\b|puppy|kitten|animal/], ['Zombies', /zombie|undead|apocalypse/],
  ['Dinosaurs', /dino|dinosaur|\bt-?rex\b|jurassic/], ['Pirates', /pirate|treasure|ship/], ['School', /school|classroom|teacher|student|\bclass\b/],
  ['Space', /\bspace\b|galaxy|planet|astronaut|alien|\bufo\b/], ['Military', /military|\barmy\b|soldier|war\b|battlefield|tank/], ['Superheroes', /superhero|super hero|\bhero(es)?\b|villain/],
  ['Fantasy', /fantasy|\bmagic|wizard|dragon|\belf\b|\borc\b|sword/], ['Medieval', /medieval|\bknight|castle|kingdom/], ['Ocean', /\bocean|\bsea\b|underwater|shark|mermaid/],
  ['Food', /\bfood|candy|ice cream|pizza|burger|cake|fruit|cooking|bakery/], ['Brainrot', /brainrot|skibidi|rizz|sigma/], ['Ninjas', /ninja|samurai|shinobi/],
  ['Robots', /\brobots?\b|\bmech\b|cyber/], ['Monsters', /monster|creature|beast|kaiju/], ['Police and crime', /police|\bcops?\b|prison|jail|heist|robbery|\bcrime/],
  ['City life', /\bcity\b|\btown\b|\bmall\b|\bhotel\b|apartment|\bhouse\b|\bhome\b/], ['Music and dance', /\bdance|\bmusic|\bsong|\bsing|concert|\bpiano/],
  ['Mystery', /mystery|murder|detective|\bspy\b|secret/], ['Eggs', /\beggs?\b|hatch/], ['Farm life', /\bfarm|garden|crops?\b|harvest/],
]);

const FEATURES = rules([
  ['Trading', /\btrad(e|ing)\b/], ['Rebirths', /rebirth|prestige|ascen[dt]/], ['Pets', /\bpets?\b|companion/], ['Quests', /\bquests?\b|missions?\b/],
  ['Bosses', /\bboss(es)?\b|raid/], ['PvP', /\bpvp\b|duel|versus|\b1v1\b/], ['Co-op', /co-?op|team up|with friends|multiplayer|squad/],
  ['Leaderboards', /leaderboard|ranking|top players/], ['Codes', /\bcodes?\b|redeem|promo/], ['Events', /\bevents?\b|limited time|seasonal|festival/],
  ['Daily rewards', /daily (reward|login|gift)|login reward|free gift/], ['Crafting', /\bcraft/], ['Upgrades', /upgrade|unlock|power up/],
  ['Customization', /customi[sz]|skins?\b|cosmetic|accessor/], ['Open world', /open[- ]world|explore/], ['Levels', /\blevel(s|ing)?\b|\bxp\b|exp\b/],
  ['Achievements', /achievement|badges?\b|trophy/], ['Minigames', /mini-?games?/], ['Housing', /\bhouse|\bhome|decorate|furniture/],
]);

const BRANDS = rules([
  ['Pokémon', /pok[eé]mon|pikachu/], ['Naruto', /naruto/], ['One Piece', /one piece|luffy/], ['Dragon Ball', /dragon ball|goku/], ['Jujutsu Kaisen', /jujutsu/],
  ['Demon Slayer', /demon slayer|kimetsu/], ['Attack on Titan', /attack on titan/], ['My Hero Academia', /my hero academia|boku no hero/], ['Bleach', /\bbleach\b/],
  ['Minecraft', /minecraft/], ['Fortnite', /fortnite/], ['Among Us', /among us|\bimpostor\b/], ['Squid Game', /squid game|red light,? green light/],
  ['Five Nights at Freddy\'s', /five nights|\bfnaf\b|freddy/], ['Poppy Playtime', /poppy playtime|huggy wuggy/], ['Sonic', /\bsonic\b/], ['Mario', /\bmario\b/],
  ['Spider-Man', /spider-?man/], ['Batman', /\bbatman\b/], ['Marvel', /\bmarvel\b|avengers/], ['Star Wars', /star wars|jedi/], ['Harry Potter', /harry potter|hogwarts/],
  ['Sanrio', /sanrio|hello kitty|kuromi|cinnamoroll/], ['Barbie', /\bbarbie\b/], ['Skibidi Toilet', /skibidi/], ['Garten of Banban', /banban|garten/],
  ['Rainbow Friends', /rainbow friends/], ['Doors', /\bdoors\b/], ['Blox Fruits', /blox fruits?/], ['Adopt Me', /adopt me/], ['Brookhaven', /brookhaven/],
  ['Jailbreak', /jailbreak/], ['Murder Mystery', /murder mystery/], ['Tower of Hell', /tower of hell/], ['Grow a Garden', /grow a garden/], ['Steal a Brainrot', /steal a brainrot/],
  ['Pet Simulator', /pet sim(ulator)?\b/], ['Bee Swarm', /bee swarm/], ['Arsenal', /\barsenal\b/], ['Phantom Forces', /phantom forces/], ['Piggy', /\bpiggy\b/],
  ['Squid', /\bsquid\b/], ['Roblox events', /roblox (event|classic)/],
]);

const EXTRAS = rules([
  ['VIP', /\bvip\b/], ['Private servers', /private servers?|vip servers?|reserved servers?/], ['Game passes', /game ?pass|gamepass|\bpass(es)?\b/],
  ['Battle pass', /battle ?pass|season pass/], ['Boosts', /\b2x\b|\bx2\b|double (cash|xp|coins|luck)|boosts?\b|luck\b/], ['Premium', /\bpremium\b|\bpro\b/],
  ['Robux shop', /robux|\bshop\b|\bstore\b/], ['Gifting', /\bgift/], ['Skips', /\bskip/], ['Auto features', /auto[- ]?(farm|collect|click|clicker|win)/],
]);

// Languages that have their own script are told apart by the characters used.
const SCRIPTS = [
  ['Japanese', /[぀-ヿ]/], ['Korean', /[가-힯]/], ['Chinese', /[一-鿿]/], ['Russian', /[Ѐ-ӿ]/], ['Arabic', /[؀-ۿ]/],
  ['Thai', /[฀-๿]/], ['Hebrew', /[֐-׿]/], ['Hindi', /[ऀ-ॿ]/],
];
// The Latin-script ones by how many of their most common words appear.
const WORDS = {
  English: 'the and you your with for are this that have from play game new will can all get our not but what more just best',
  Spanish: 'el la los las de que con para una por mi es en se tu juego juega nuevo gratis amigos',
  Portuguese: 'o a os as de que com para uma por meu é em se seu jogo jogar novo grátis amigos você não',
  French: 'le la les des que avec pour une par mon est en se ton jeu jouer nouveau gratuit amis vous pas',
  German: 'der die das und mit für eine ist nicht du dein spiel spielen neu kostenlos freunde',
  Italian: 'il lo gli che con per una di è in se tuo gioco giocare nuovo gratis amici non',
  Indonesian: 'yang dan di untuk dengan ini itu kamu bermain permainan baru gratis teman tidak',
  Turkish: 've bir bu için ile ben sen oyun oyna yeni ücretsiz arkadaş değil',
  Polish: 'i w na z do się nie to gra graj nowy za darmo znajomi',
  Filipino: 'ang ng sa mga ay na ko mo laro bago libre kaibigan hindi',
  Vietnamese: 'và của là có không cho trò chơi mới miễn phí bạn bè',
  Dutch: 'de het een en van voor met is niet je spel spelen nieuw gratis vrienden',
};
const STOP = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [k, new Set(v.split(' '))]));

function language(text) {
  for (const [name, re] of SCRIPTS) if (re.test(text)) return name;
  // One-letter words ("a", "o", "i") are in half the languages, so they say nothing.
  const tokens = (text.toLowerCase().match(/\p{L}+/gu) ?? []).filter((t) => t.length > 1);
  if (tokens.length < 3) return null;
  const score = (name) => tokens.filter((t) => STOP[name].has(t)).length;
  let best = null, top = 0;
  for (const name of Object.keys(STOP)) { const hits = score(name); if (hits > top) { top = hits; best = name; } }
  // Mixed text goes to English unless another language clearly leads; unclear text is left out.
  if (best !== 'English' && score('English') >= top * 0.7) best = 'English';
  return best && score(best) >= 2 ? best : null;
}

const run = (list, text) => list.filter(([, re]) => re.test(text)).map(([tag]) => tag);

/** Tags for one game. */
export function tag(name, description) {
  const text = `${name ?? ''}\n${description ?? ''}`.toLowerCase().slice(0, 1500);
  const lang = language(`${name ?? ''} ${description ?? ''}`.slice(0, 800));
  return {
    type: run(TYPES, text),
    theme: run(THEMES, text),
    feature: run(FEATURES, text),
    brand: run(BRANDS, text),
    extra: run(EXTRAS, text),
    language: lang ? [lang] : [],
  };
}
