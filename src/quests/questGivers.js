// Fixed cast: quest givers + the Grumpy baker target, with their personalities and starting spots.
// `home` is where they stand around (they still wander a little near it).
export const SPECIAL_NPCS = [
  { id: 'sunny', name: 'Sunny Sam', personality: 'cheerful', home: [4, 6], giver: true },
  { id: 'tilly', name: 'Timid Tilly', personality: 'shy', home: [-6, 5], giver: true },
  { id: 'crumbs', name: 'Captain Crumbs', personality: 'pirate', home: [8, -12], giver: true },
  { id: 'dolores', name: 'Diva Dolores', personality: 'dramatic', home: [-10, -6], giver: true },
  { id: 'unit7', name: 'Unit 7', personality: 'robot', home: [-4, -16], giver: true },
  { id: 'gary', name: 'Gruff Gary', personality: 'grumpy', home: [10, 3], giver: true },
  { id: 'bruno', name: 'Bruno the Baker', personality: 'grumpy', home: 'bakery', hat: 'chef', baker: true, noWander: true },
];
