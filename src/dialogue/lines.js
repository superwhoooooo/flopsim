// Every dialogue line. All clean. `start: true` lines are unlocked at the beginning;
// the rest are unlocked by finishing quests (see quests/quests.js `reward`).
export const LINES = [
  { id: 'hello', text: 'Hello there!', start: true },
  { id: 'nicehat', text: 'Nice hat!', start: true },
  { id: 'weather', text: 'Lovely weather today!', start: true },
  { id: 'howdy', text: 'How are you doing?', start: true },

  { id: 'bestfriend', text: "You're my best friend!" },
  { id: 'hero', text: "I'm the hero of this town!" },
  { id: 'oops', text: 'Oops, my elbow slipped!' },

  { id: 'bread', text: 'Got any fresh bread?' },
  { id: 'dance', text: 'Want to dance?' },
  { id: 'joke', text: 'Why did the chicken cross the road?' },

  { id: 'sorry', text: 'Sorry, I tripped!' },
  { id: 'challenge', text: 'I challenge you to a staring contest!' },

  { id: 'gift', text: 'I have a gift for you!' },
  { id: 'sparkle', text: 'You look sparkly today!' },
  { id: 'race', text: 'Race you to the lighthouse!' },

  { id: 'treasure', text: 'Do you know where the treasure is?' },
  { id: 'view', text: 'What a gorgeous view!' },

  { id: 'goodbye', text: 'Goodbye, my wonderful friend!' },
  { id: 'secret', text: 'Want to hear a secret?' },
  { id: 'highfive', text: 'High five!' },

  { id: 'dizzy', text: "I'm so dizzy!" },
  { id: 'tornado', text: 'I am a human tornado!' },

  { id: 'newfriend', text: "Let's be friends!" },
  { id: 'compliment', text: 'You have a great smile!' },

  { id: 'beepbeep', text: 'Beep beep, coming through!' },
  { id: 'roadtrip', text: 'Road trip, anyone?' },

  { id: 'encore', text: 'Encore! Encore!' },
  { id: 'bow', text: "Thank you, I'll be here all week!" },

  { id: 'robotdance', text: 'I can do the robot!' },
  { id: 'science', text: 'For science!' },

  { id: 'parking', text: 'Have you seen my parking spot?' },
  { id: 'calmdown', text: 'Everybody calm down!' },

  { id: 'scaredycat', text: 'Ha! Missed me!' },
  { id: 'hideandseek', text: 'Want to play hide and seek?' },

  { id: 'starring', text: 'Starring... ME!' },
  { id: 'autograph', text: 'Want my autograph?' },

  // Abilities: take up a hotbar slot like a line, but pressing the key uses the ability (see abilities.js)
  { id: 'ab_longarms', text: '\u2728 Long Arms', ability: 'longarms' },
  { id: 'ab_npcrain', text: '\u2728 NPC Rain', ability: 'npcrain' },
  { id: 'ab_superjump', text: '\u2728 Super Jump', ability: 'superjump' },
  { id: 'ab_bonkwave', text: '\u2728 Bonk Wave', ability: 'bonkwave' },
];
export const LINE_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l]));
export const START_LINES = LINES.filter((l) => l.start).map((l) => l.id);
