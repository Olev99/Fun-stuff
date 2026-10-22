import { medalTimes } from './medals.js';

// The Legends League: the post-game map that opens after the Golden Wheel.
// Three seasons of six events, shaped exactly like CHAPTERS in career.js (same
// event fields, ids 'L1-1'..'L3-6'), so stars, first-clear bonuses, drops and
// saves work unchanged. This file is plain data plus the Legend Rank maths and
// has no imports from career.js (career.js imports it).
//
// Extra event fields over the story chapters:
//   ev    track events (events.js): 'off' | 'signature' | 'wild', like the story chapters in career.js
//   mod   a twist from DAILY_MODS (profile.js) applied to the race
//   cls   speed class for this event only (Gold medal times are Zoom class)
//   tm    star multipliers for a time event [2 stars, 3 stars]
//   gold  a time event whose target is the Gold medal time of its track
//   battle events (type 'battle', track = an arena id) are Balloon Battles: finish in the top `goal`
// Season fields: mult (coin multiplier), field (returning racers always in the
// grid), joins: [] (nobody new joins the team).

const gold = (track) => +medalTimes(track)[2].toFixed(2);

export const LEAGUE = [
  {
    id: 'L1', name: 'Comeback Season', ev: 'signature', rival: 'ember', alt: 'pip', field: ['hopper', 'zorp', 'pip', 'volt'], joins: [], league: true,
    cls: 'zoom', diff: 'hard', bossDiff: 'hard', mult: 1.2,
    blurb: 'The old champions are back, and every one of them has something to prove.',
    ai: { bodies: ['comet', 'classic', 'stomper'], up: 2 }, boss: { body: 'bolt', up: 3 },
    clue: 'Someone pinned a note to the finish banner: "A TRUE LEAGUE IS TESTED. -M". It smelled of honey.',
    intro: [
      ['mic', 'Racing fans, the Golden Wheel has a champion and the Circuit has a brand new boss. Baron Von Boost, you have the microphone. Please give it back afterwards.'],
      ['baron', 'Boost Corp is, how shall I put it, in a heap. The lawyers are reading my moustache for clues. So! No company this time. A league run by racers, for racers: the Legends League.'],
      ['baron', 'Three seasons, every old champion has a seat, and I would be honoured if our scrapyard champion became its first Legend. I will be at the back. Carrying the coffee.'],
      ['gramps', 'He has practised that apology for three weeks. Take the free sandwich, kid, and go win something.'],
      ['hopper', 'Ribbit! The old crew is back! Nobody has told us the rules yet, so I assume there are none!'],
    ],
    bossIntro: [['ember', 'No sponsor, no contract, no replacement driver. Just me, my own pads and a very large grudge. Lap one is mine.']],
    outro: [
      ['ember', 'Ha! You beat me fair and square, and I am not even mad. First time I have lost without someone writing it in a report.'],
      ['mic', 'And that is the Comeback Season! The old champions are back, the fans are on their feet and... wait. What is that on the finish banner?'],
      ['gramps', '"A true league is tested. M." Hm. Honey on the paper. Somebody around here has a sweet tooth and a sense of drama.'],
      ['mic', 'Season Two starts soon, folks. Keep your helmets on and your sandwiches close.'],
    ],
    events: [
      {
        id: 'L1-1', type: 'race', track: 'downs', goal: 3, title: 'Reunion Tour', reward: 350,
        after: [
          ['hopper', 'Ribbit! Boost Corp is gone, so I can finally stop shouting BOOST IT every time I land. ...BOOST IT! Sorry. It is a habit now.'],
          ['mic', 'The crowd loves it, Hopper. Please do not stop.'],
        ],
      },
      {
        id: 'L1-2', type: 'gems', track: 'coral', n: 20, title: 'Gem Shop Grand Opening', reward: 350, drop: 'mudBoots',
        after: [
          ['zorp', 'Zorp has opened a gem shop on the beach. Zorp accepts gems as payment. Zorp is also the only customer.'],
          ['gramps', 'Slow day at the shop, then. Mud Boots are a Zorp-approved way to shrug off sand, by the way.'],
        ],
      },
      {
        id: 'L1-3', type: 'time', track: 'tidal', target: gold('tidal'), gold: true, cls: 'zoom', tm: [0.975, 0.94], title: 'Gold Standard', reward: 400, drop: 'engine3',
        tip: 'Gold is the best a Hard racer can do in a stock kart. Beat it with a good build and the shortcuts. Rocket Pill and Drift Spring save seconds.',
        after: [
          ['pip', 'Hey, look at the finish banner! Somebody pinned a note on it. "A true league is tested. M." Who is M? Mochi? Mic? Marvin?'],
          ['gramps', 'Smells like honey. Huh. Keep it. Anyone who signs a note with one letter has something to say.'],
        ],
      },
      {
        id: 'L1-4', type: 'race', track: 'frost', rev: true, goal: 2, title: 'Flipside Frost', reward: 400, drop: 'turbo3',
        after: [
          ['pip', 'I started my own scarf brand! Same scarf as everyone else, but now it is MY scarf. I have sold two. One to me.'],
          ['mic', 'Not everyone could make the first season. Bruno sent a postcard from his fishing trip: "Too busy to race. Heh. Good luck."'],
          ['gramps', 'Bruno? Too busy? That bear has been waiting for a rematch for a month. Strange.'],
        ],
      },
      {
        id: 'L1-5', type: 'cup', tracks: ['hollow', 'maple', 'jungle', 'gear'], title: 'Old Champions Cup', reward: 650, drop: 'tyres3',
        after: [
          ['volt', 'DETECTED: THE FENCE ON THE LAST HAIRPIN WAS FRESHLY WELDED. SOMEONE FIXED IT IN THE NIGHT. WHO DOES THAT. COMPASSION.EXE APPROVES.'],
          ['rexi', 'STOMP! I just stomp! I do not weld!'],
        ],
      },
      { id: 'L1-6', type: 'duel', track: 'maple', title: 'Ember Rekindled', reward: 900, boss: true, drop: 'wingKit', bp: true },
    ],
  },
  {
    id: 'L2', name: 'Masked Rival', ev: 'signature', rival: 'mask', alt: 'ember', field: ['ember', 'volt', 'rexi'], joins: [], league: true,
    cls: 'turbo', diff: 'hard', bossDiff: 'hard', mult: 1.35,
    blurb: 'Someone in a mask keeps wrecking the events. Who, and why?',
    ai: { bodies: ['comet', 'stomper', 'classic'], up: 3 }, boss: { body: 'stomper', up: 4 },
    clue: 'The Masked Racer is huge, says "Heh", fixes everything afterwards and leaves honey on the evidence.',
    intro: [
      ['mic', 'Season Two, Turbo class! And we have a surprise guest, folks. A racer in a mask has entered all six events. Under the name "M".'],
      ['mask', 'The League has gone soft. Soft karts, soft tracks, soft champions. Let us fix that. Heh.'],
      ['gramps', 'Heh? I know that laugh from somewhere. ...Nope. Gone again. Watch the tracks, kid. Anything can happen with that one around.'],
    ],
    bossIntro: [['mask', 'One lap game, one on one. If you lose your nerve, the League loses its champion. Show me you are one. Heh.']],
    outro: [
      ['bruno', 'Heh. Good racing, champ.'],
      ['mic', 'The mask is off! It is... BRUNO! The Big Bear himself!'],
      ['bruno', 'Five years I held the Wheel. Then a scrapyard kid took it, and I was not angry. I was scared. If the new champion folded when things went wrong, the League would fold with her. So I broke everything and watched.'],
      ['gramps', 'And fixed it all by morning. Fresh welds. Honey on the planks. I should have known, you big softy.'],
      ['bruno', 'You never quit, kid. Not once. Season Three is yours. ...Also, Gus has been hiding something in the shed. Go ask him.'],
    ],
    events: [
      {
        id: 'L2-1', type: 'race', track: 'candy', goal: 3, mod: 'bombs', title: 'Boom Boom Bash', reward: 450,
        after: [
          ['mic', 'Every item box on the track was swapped for bombs overnight! Who does that?'],
          ['mask', 'Boom. Heh.'],
        ],
      },
      {
        id: 'L2-2', type: 'battle', track: 'pinball', goal: 2, title: 'Pinball Panic', reward: 450, drop: 'armor3',
        tip: 'A Balloon Battle: four balloons each, pop the others before they pop yours. Finish top 2 to clear it. Bumper Plate shoves harder, Item Pouch holds a spare.',
        after: [
          ['gramps', 'Giant paw prints on the pinball bumpers. Fresh welds on the flippers. Whoever it is breaks things, then fixes them.'],
          ['ember', 'That is the worst saboteur I have ever met. Very tidy.'],
        ],
      },
      {
        id: 'L2-3', type: 'time', track: 'cloud', target: gold('cloud'), gold: true, cls: 'zoom', tm: [0.975, 0.94], title: 'Cloud Nine Gold', reward: 500, drop: 'engine3',
        tip: 'Gold time on the Cloud Carnival. The masked racer cannot touch a solo lap, so it is just you and the clock. Use every glide ramp.',
        after: [
          ['volt', 'ANALYSIS: MASKED RACER IS 94 PERCENT MUSCLE, 5 PERCENT KART AND 1 PERCENT SNACKS.'],
          ['mic', 'Another note on the banner: "Nobody gets a perfect season. M." Rude, but also true.'],
        ],
      },
      {
        id: 'L2-4', type: 'race', track: 'magma', ev: 'wild', goal: 2, mod: 'moon', title: 'Lava Lunar Leap', reward: 550, drop: 'turbo3',
        after: [
          ['rexi', 'STOMP! The gravity left! Somebody turned it down! I flew past the volcano!'],
          ['mask', 'Heh. Smooth landing, rookie.'],
          ['mic', 'Low gravity AND lava rain! The meteors take twice as long to land. Somehow that makes it scarier.'],
        ],
      },
      {
        id: 'L2-5', type: 'race', track: 'odyssey', goal: 2, title: 'Odyssey Overboard', reward: 600, drop: 'tyres3',
        after: [
          ['gramps', 'The rope bridge was cut at dawn and glued back together by lunch. With honey. Honey on the planks. Honey on a bridge, kid!'],
          ['gramps', 'Who in this whole League loves honey that much...? Hm. Keep racing. I will think.'],
        ],
      },
      { id: 'L2-6', type: 'duel', track: 'jungle', ev: 'wild', title: 'Under the Mask', reward: 1200, boss: true, drop: 'itemPouch', bp: true },
    ],
  },
  {
    id: 'L3', name: 'Gearbox Gus', ev: 'wild', rival: 'gearbox', alt: 'bruno', field: ['bruno', 'ember', 'hopper', 'pip'], joins: [], league: true,
    cls: 'turbo', diff: 'hard', bossDiff: 'hard', mult: 1.5,
    blurb: 'Gramps comes out of retirement. One race, properly, at last.',
    ai: { bodies: ['comet', 'stomper', 'bolt'], up: 4 }, boss: { body: 'bolt', up: 5 },
    clue: 'Gramps never raced his student. Seven lessons, one wrench, one Starbolt in the shed.',
    intro: [
      ['mic', 'Season Three! Folks, there is a sign on Gramps\'s Workshop door: "Closed for racing." Nobody knows what it means. ...No relation to Gus the walrus, by the way. Different Gus. Fewer tusks.'],
      ['gramps', 'I taught you everything I know, kid. Lift before the bend. Drift long. Never trust a fence. But I never raced you. Not once. That is about to change.'],
      ['gramps', 'Finish the League. Show me every lesson. And at the end of it, I will be waiting. With the Starbolt.'],
      ['mic', 'Weather desk says Season Three storms are "extra". I asked what extra means. They laughed, and then they stopped laughing.'],
    ],
    bossIntro: [
      ['gearbox', 'Out of retirement, out of the shed and out of excuses. Thirty years since I raced the Wheel, and I wouldn\'t pick anyone else to race now.'],
      ['gearbox', 'This is the Starbolt. The real one. Every bolt in it is mine. The Baron kept the plans, but the kart was always in my head.'],
      ['mic', 'Gearbox Gus versus the scrapyard champion, on the road where it all began! One lap duel, folks, three laps of history!'],
    ],
    outro: [
      ['gearbox', 'Well. That is how it feels to lose to your own student. I have never been so proud to be beaten.'],
      ['gramps', 'Don\'t you dare apologise, kid. I found a girl in a scrapyard with a bucket and a gut feeling. Best find of my life.'],
      ['baron', 'May I say, as owner of absolutely nothing: that was the finest race of my career as a spectator.'],
      ['bruno', 'Heh. I cried a little. Do not tell anyone. I will deny it. I have the mask to hide behind.'],
    ],
    epilogue: [
      ['mic', 'And that is a wrap on the first three seasons of the Legends League! The Legend has been crowned, the old champions are home and the Baron has moved on to selling lemonade.'],
      ['baron', 'It is a very good lemonade. Nobody checks the fine print. There is none.'],
      ['gramps', 'Thank you, kid. For the races, for the scrapyard, for the bucket. You gave an old badger his best seasons.'],
      ['mic', 'More seasons, more tracks and more rivals are coming soon. Thank you for racing with us, Legend. See you on the road.'],
    ],
    events: [
      {
        id: 'L3-1', type: 'race', track: 'obsidian', rev: true, goal: 2, title: 'Lesson One: Lift', reward: 550,
        after: [
          ['gearbox', 'Lesson one. Lift before the bend. Everybody wants to go faster. The fast ones know when to go slower.'],
          ['gramps', 'I said that once in 1987 and nobody listened. You did.'],
        ],
      },
      {
        id: 'L3-2', type: 'gems', track: 'moon', n: 26, title: 'Lesson Two: Gather', reward: 550, drop: 'armor3',
        after: [
          ['gearbox', 'Lesson two. A gem on the line is a coin in your pocket. Never let a gem go home alone.'],
        ],
      },
      {
        id: 'L3-3', type: 'time', track: 'gear', target: gold('gear'), gold: true, cls: 'zoom', tm: [0.975, 0.94], title: 'Lesson Three: The Clock', reward: 600, drop: 'engine3',
        tip: 'Gold time on Gearworks, the track where Gramps learned to weld. Drifts, shortcuts, a clean lap: all of it, or no star.',
        after: [
          ['gearbox', 'Lesson three. The clock does not care who you are. It will tell you the truth, every time. Learn to love it.'],
        ],
      },
      {
        id: 'L3-4', type: 'race', track: 'hopper', goal: 2, mod: 'speed', title: 'Lesson Four: Island Hopper', reward: 650, drop: 'tyres3',
        after: [
          ['gearbox', 'Lesson four. Land softly, leave loudly. Chilis, rockets and rainbows are not cheating if everyone gets them.'],
          ['hopper', 'Hey, that is my island! BOOST IT!'],
        ],
      },
      {
        id: 'L3-5', type: 'cup', tracks: ['glacier', 'moon', 'obsidian', 'neon'], mod: 'bees', title: 'Gramps\'s Gauntlet', reward: 900, drop: 'turbo3',
        after: [
          ['gearbox', 'Lesson five. When everything goes wrong, drive anyway. That is the whole of racing. The rest is paint.'],
          ['bruno', 'I would know. I broke everything for a whole season. ...Heh.'],
        ],
      },
      { id: 'L3-6', type: 'duel', track: 'sprout', title: 'The Final Duel', reward: 1700, boss: true, drop: 'comebackSpring', bp: true },
    ],
  },
];

export const LEAGUE_EVENTS = LEAGUE.flatMap((s) => s.events);
export const LEAGUE_MAX_STARS = LEAGUE_EVENTS.length * 3;
const IDS = new Set(LEAGUE_EVENTS.map((e) => e.id));
export const isLeagueEvent = (id) => IDS.has(id);

// ---------------- Legend Rank ----------------
// Derived from the League stars in the save (c.stars), so there is no extra
// save field: stars needed for rank 1..10. Rank 10 leaves 4 stars spare so the
// "every event 3-starred" trophy stays a separate goal.
export const RANK_STARS = [0, 3, 8, 14, 20, 27, 34, 41, 46, 50];
export const MAX_RANK = RANK_STARS.length;

export function leagueStars(c) {
  const st = (c && c.stars) || {};
  return LEAGUE_EVENTS.reduce((a, e) => a + Math.min(3, Math.max(0, Math.round(Number(st[e.id]) || 0))), 0);
}
export function rankForStars(n) {
  let r = 1;
  for (let i = 1; i < MAX_RANK; i++) if (n >= RANK_STARS[i]) r = i + 1;
  return r;
}
export const legendRank = (c) => rankForStars(leagueStars(c));
// { rank, stars, next (stars for the next rank or 0 at the top), into, need }
export function rankInfo(c) {
  const stars = leagueStars(c), rank = rankForStars(stars);
  const next = rank >= MAX_RANK ? 0 : RANK_STARS[rank];
  return { rank, stars, next, into: stars - RANK_STARS[rank - 1], need: next ? next - RANK_STARS[rank - 1] : 0 };
}

// What each reward rank gives: cosmetic ids (cosmetics.js) and paint ids (career.js).
export const RANK_REWARDS = {
  2: { cos: ['lg_laurel', 'lg_gong'], paints: [] },
  4: { cos: ['lg_flare'], paints: ['lg_teal'] },
  6: { cos: ['lg_checker', 'lg_stadium'], paints: [] },
  8: { cos: ['lg_aurora'], paints: ['lg_plum'] },
  10: { cos: ['lg_crest'], paints: [], title: 'Legend' },
};
export const REWARD_RANKS = Object.keys(RANK_REWARDS).map(Number);

// Rewards of every rank up to `rank` that the save does not own yet. Safe to
// call any time (it only adds what is missing), so a merged or imported save
// ends up with exactly the rewards its stars have earned. Returns what was added.
export function grantLeagueRewards(c, rank = legendRank(c)) {
  const added = { cos: [], paints: [] };
  c.cos = Array.isArray(c.cos) ? c.cos : [];
  c.paints = Array.isArray(c.paints) ? c.paints : [];
  for (const r of REWARD_RANKS) {
    if (r > rank) break;
    for (const id of RANK_REWARDS[r].cos) if (!c.cos.includes(id)) { c.cos.push(id); added.cos.push(id); }
    for (const id of RANK_REWARDS[r].paints) if (!c.paints.includes(id)) { c.paints.push(id); added.paints.push(id); }
  }
  return added;
}

// League cosmetics a save claims without the rank are removed (a hostile or
// edited save), then the ones its rank has earned are given. Run by cleanCareer.
export function enforceLeagueRewards(c) {
  const rank = c.champion ? legendRank(c) : 0;
  const need = {};
  for (const r of REWARD_RANKS) for (const id of [...RANK_REWARDS[r].cos, ...RANK_REWARDS[r].paints]) need[id] = r;
  if (Array.isArray(c.cos)) c.cos = c.cos.filter((id) => !(id in need) || need[id] <= rank);
  if (Array.isArray(c.paints)) c.paints = c.paints.filter((id) => !(id in need) || need[id] <= rank);
  if (c.hat in need && need[c.hat] > rank) c.hat = 'nohat';
  if (c.trail in need && need[c.trail] > rank) c.trail = 'classic';
  if (c.horn in need && need[c.horn] > rank) c.horn = 'beep';
  if (c.paint in need && need[c.paint] > rank) c.paint = 'stock';
  return rank ? grantLeagueRewards(c, rank) : { cos: [], paints: [] };
}

// Profile title earned by rank.
export const profileTitle = (c) => (legendRank(c) >= MAX_RANK ? 'Legend' : '');
