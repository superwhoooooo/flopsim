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
];
export const LINE_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l]));
export const START_LINES = LINES.filter((l) => l.start).map((l) => l.id);
