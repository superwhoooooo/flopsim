// Feats: little challenges you discover by messing around. Secret ones show as "???" until done.
// Detection lives in discovery.js; each feat just needs an id here.
export const FEATS = [
  // ---- flopping ----
  { id: 'first_flop', name: 'First Flop', hint: 'Fall over. It is easy.', pts: 25 },
  { id: 'long_flop', name: 'Tumbleweed', hint: 'Tumble 15 m in a single flop.', pts: 75 },
  { id: 'epic_flop', name: 'Gone With The Wind', hint: 'Tumble 40 m in a single flop.', pts: 150 },
  { id: 'airtime', name: 'Frequent Flyer', hint: 'Stay in the air for 3 seconds.', pts: 75 },
  { id: 'sky_high', name: 'Cloud Botherer', hint: 'Get 16 m off the ground. (Super Jump from somewhere high?)', pts: 150 },
  { id: 'rooftop', name: 'Rooftop Club', hint: 'Stand on a roof.', pts: 75 },
  { id: 'harbour', name: 'Walk on Water', hint: 'There is more to this city than the city...', pts: 100, secret: true,
    done: 'Walked out past the seawall onto the harbour.' },
  // ---- bonking ----
  { id: 'multi_ko', name: 'Strike!', hint: 'Knock out 4 people within 1.5 seconds.', pts: 100 },
  { id: 'domino', name: 'Domino Effect', hint: 'A really, really big pile-up.', pts: 200, secret: true,
    done: 'Knocked out 8 people within 3 seconds.' },
  { id: 'ko25', name: 'Bonk Enthusiast', hint: 'Knock out 25 people.', pts: 50 },
  { id: 'ko100', name: 'Bonk Legend', hint: 'Knock out 100 people.', pts: 200 },
  { id: 'ko250', name: 'Bonk Master', hint: 'Knock out 250 people (friends count too). Unlocks the Lift Beam!', pts: 300 },
  { id: 'limbs', name: 'Some Assembly Required', hint: 'Knock 10 limbs off people.', pts: 100 },
  { id: 'baker', name: 'Unleavened', hint: 'Somebody in town really kneads a nap.', pts: 50, secret: true, done: 'Knocked out Bruno the Baker.' },
  { id: 'shopko', name: 'Customer Service', hint: 'Complain to the management. Forcefully.', pts: 50, secret: true, done: 'Knocked out a shopkeeper.' },
  { id: 'giverko', name: 'Biting the Hand', hint: 'Bonk someone who trusted you.', pts: 50, secret: true, done: 'Knocked out a quest giver.' },
  { id: 'fivehit', name: 'Five in One', hint: 'Knock out 5 people with a single hit. Unlocks a new skin!', pts: 200 },
  { id: 'spin', name: 'Human Tornado', hint: 'Spin (hold R) for 8 seconds without stopping.', pts: 75 },
  // ---- cars ----
  { id: 'carboom', name: 'Insurance Fraud', hint: 'Blow up a car while you are driving it.', pts: 50 },
  { id: 'hitrun', name: 'Rush Hour', hint: 'Knock out 3 people with a car in one drive.', pts: 100 },
  { id: 'speed', name: 'Speed Demon', hint: 'Hit top speed in a car (hold Shift to boost).', pts: 75 },
  // ---- the sky is falling ----
  { id: 'veg_victim', name: 'Five a Day', hint: 'Get flattened by a giant vegetable.', pts: 75 },
  { id: 'veg_rider', name: 'Salad Surfer', hint: 'What goes down must be climbed.', pts: 100, secret: true, done: 'Stood on top of a giant vegetable.' },
  // ---- everything else ----
  { id: 'chatter', name: 'Motormouth', hint: 'Say 30 lines to people.', pts: 50 },
  { id: 'zoologist', name: 'Zoologist', hint: 'Try every animal skin (B).', pts: 75 },
  { id: 'webswing', name: 'Swing Shift', hint: 'Web swing 100 m in one go.', pts: 100 },
  { id: 'web1000', name: 'Web Head', hint: 'Web swing 1000 m in total. Unlocks the Grapple Hook!', pts: 200 },
  { id: 'armory', name: 'Arms Dealer', hint: 'Own 10 different weapons.', pts: 100 },
  { id: 'fashion', name: 'Fashionista', hint: 'Wear 4 different hats (H).', pts: 50 },
  { id: 'ducks10', name: 'Duck Spotter', hint: 'Find 10 golden ducks.', pts: 100 },
  { id: 'ducks30', name: 'Golden Flock', hint: 'Find all 30 golden ducks.', pts: 300 },
  { id: 'tourist', name: 'Tourist', hint: 'Discover every landmark (M shows the map).', pts: 200 },
  { id: 'quests', name: 'Pillar of the Community', hint: 'Finish every quest.', pts: 300 },
];
export const FEAT_BY_ID = Object.fromEntries(FEATS.map((f) => [f.id, f]));

// Flop Points ranks. Each rank past the first gives a hat.
export const RANKS = [
  { pts: 0, name: 'Wobbly Newbie' },
  { pts: 300, name: 'Floppy Amateur', hat: 'party' },
  { pts: 800, name: 'Bonk Apprentice', hat: 'beanie' },
  { pts: 1600, name: 'Ragdoll Regular', hat: 'cone' },
  { pts: 2800, name: 'Chaos Enthusiast', hat: 'tophat' },
  { pts: 4500, name: 'Flop Professional', hat: 'propeller' },
  { pts: 7000, name: 'Legend of the Flop', hat: 'crown' },
];
export const DUCK_HATS = { 5: 'tricorn', 10: 'chef', 20: 'antenna', 30: 'duckhat' };

export const POINTS = { ko: 10, duck: 50, landmark: 50, quest: 100 };
