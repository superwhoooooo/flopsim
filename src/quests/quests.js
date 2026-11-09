// Quest definitions and tracker. States: available -> active -> ready (objective done) -> done (turned in).
import { LINE_BY_ID } from '../dialogue/lines.js';

export const QUESTS = [
  {
    id: 'bonk', title: 'Bonk Basics', giver: 'sunny', event: 'knockout', goal: 5,
    desc: 'Knock over 5 people (a good bonk sends them to dreamland for a bit).',
    offer: "Hi! Want to learn how to bonk? Knock over 5 people and I'll teach you some friendly phrases!",
    waiting: 'Keep bonking! Five people, remember?', ready: 'You did it! Take these lines!',
    reward: ['bestfriend', 'hero', 'oops'],
  },
  {
    id: 'baker', title: 'The Grumpy Baker', giver: 'tilly', event: 'talkBaker', goal: 1,
    desc: 'Talk to Bruno, the Grumpy baker. Walk up to him and press E.',
    offer: "Um... could you go talk to Bruno the baker? He is... very grumpy. I'm too scared...",
    waiting: 'Did you talk to Bruno yet? Please?', ready: 'You talked to him! You are so brave!',
    reward: ['bread', 'dance', 'joke'],
  },
  {
    id: 'axe', title: 'Axe Practice', giver: 'crumbs', event: 'axeHit', goal: 3,
    desc: 'Hit someone with the axe 3 times. Hold Tab to pick the axe!',
    offer: 'Arr, matey! Swing an axe at three scallywags and I will teach ye some pirate talk!',
    waiting: 'Three axe hits, matey. Keep swingin!', ready: 'Arr! A fine axe arm ye have!',
    reward: ['sorry', 'challenge'],
  },
  {
    id: 'hat', title: 'The Lost Hat', giver: 'dolores', event: 'hatFound', goal: 1,
    desc: 'Find the lost pink hat with a feather, somewhere in the west park, behind some rocks.',
    offer: 'My fabulous hat is LOST! It blew away to the park in the west! Find it, darling, find it!',
    waiting: 'My hat! Where is my hat?! The west park, behind the rocks!', ready: 'My hat! My beautiful hat! You are a star!',
    reward: ['gift', 'sparkle', 'race'],
  },
  {
    id: 'lighthouse', title: 'Lighthouse Trip', giver: 'unit7', event: 'lighthouse', goal: 1,
    desc: 'Visit the lighthouse on the pier in the far north-east corner of the city.',
    offer: 'BEEP. Human unit, please visit the lighthouse and report back on the view.',
    waiting: 'Lighthouse not yet visited. It is red and white. Tall.', ready: 'Excellent. View data received. Rewards dispatched.',
    reward: ['treasure', 'view'],
  },
  {
    id: 'chat', title: 'Chatterbox', giver: 'gary', event: 'sayTo', setKey: 'key', goal: 6,
    desc: 'Say a line to every personality: Grumpy, Cheerful, Shy, Dramatic, Pirate-ish and Robot-ish.',
    offer: 'Tch. Talk to every kind of person in this town. All six types. Then maybe I will be impressed.',
    waiting: 'Still need to chat with every type of person.', ready: 'Fine. You are a proper chatterbox. Take these.',
    reward: ['goodbye', 'secret', 'highfive'],
  },
  // ---- second quest for each giver: unlocks after their first one is turned in (`after`) ----
  {
    id: 'spin', title: 'Spin Cycle', giver: 'sunny', after: 'bonk', event: 'knockout', match: (p) => p.spinning, goal: 3,
    desc: 'Knock out 3 people while spinning. Hold R to spin with a melee weapon out!',
    offer: "Ooh, I have a new one! Hold R and spin like a top! Bonk 3 people while you're spinning!",
    waiting: 'Spin, spin, spin! Three bonks while twirling!', ready: "Wheee! You're a human tornado! Here!",
    reward: ['dizzy', 'tornado'],
  },
  {
    id: 'friends', title: 'Making Friends', giver: 'tilly', after: 'baker', event: 'sayTo', setKey: 'npc', goal: 5,
    desc: 'Say a line (keys 1 - 0) to 5 different people.',
    offer: "I want to make friends but I'm too shy... could you say hello to 5 different people? Show me how?",
    waiting: 'Five different people... you can do it! I believe in you!', ready: "Wow, five new friends! Maybe I can do it too...",
    reward: ['newfriend', 'compliment'],
  },
  {
    id: 'joyride', title: 'Joyride', giver: 'crumbs', after: 'axe', event: 'drive', goal: 400,
    desc: 'Drive a car for 400 metres. Find a parked car and press E.',
    offer: 'Arr, these land-ships be fascinatin! Sail one of them cars 400 metres and tell me how she handles!',
    waiting: 'Keep sailin that land-ship, matey! 400 metres!', ready: 'Arr! A natural captain of the road!',
    reward: ['beepbeep', 'roadtrip'],
  },
  {
    id: 'rivals', title: 'Rival Actors', giver: 'dolores', after: 'hat', event: 'knockout', match: (p) => p.personality === 'dramatic', goal: 3,
    desc: 'Knock out 3 Dramatic people (red shirts, top hats).',
    offer: 'Those other DRAMATIC people are stealing my spotlight! Bonk three of them, darling. Gently. Ish.',
    waiting: 'Three dramatic rivals, darling! Top hats! Red shirts!', ready: 'The stage is MINE again! Bravo, bravo!',
    reward: ['encore', 'bow'],
  },
  {
    id: 'survey', title: 'Weapon Survey', giver: 'unit7', after: 'lighthouse', event: 'weaponHit', setKey: 'key', goal: 4,
    desc: 'Hit people with 4 different weapons (a car counts too). Shops sell more weapons.',
    offer: 'BEEP. New research task: collect impact data from four different weapon types. On other humans. Not me.',
    waiting: 'Weapon data incomplete. Four different types required.', ready: 'Impact database complete. Fascinating. Rewards dispatched.',
    reward: ['robotdance', 'science'],
  },
  {
    id: 'roadrage', title: 'Road Rage', giver: 'gary', after: 'chat', event: 'carKO', goal: 3,
    desc: 'Knock out 3 people by hitting them with a car.',
    offer: 'People keep walking in the road. Drive a car and teach 3 of them a lesson. Gently. Or not.',
    waiting: 'Three people. With a car. Get going.', ready: 'Hmph. The roads are quieter now. Fine. Take these.',
    reward: ['parking', 'calmdown'],
  },

  // ---- third quest for each giver. Four of them reward an ability (goes in a hotbar slot) ----
  {
    id: 'kaboom', title: 'Kaboom Party', giver: 'sunny', after: 'spin', event: 'knockout', match: (p) => p.weapon === 'rocket', goal: 3,
    desc: 'Knock out 3 people with the Rocket Launcher (Gunsmith Gerda sells one).',
    offer: "Let's throw a PARTY! A rocket party! Knock out 3 people with a rocket launcher and I'll make it rain... people!",
    waiting: 'Three rocket bonks! Gerda has a launcher!', ready: "BEST PARTY EVER! Now you can make it rain people!",
    reward: ['ab_npcrain'],
  },
  {
    id: 'escape', title: 'Escape Artist', giver: 'tilly', after: 'friends', event: 'axeEscape', goal: 1,
    desc: 'Survive an axe attack: when someone pulls out an axe, sprint away (or knock them out) before they get you.',
    offer: "Sometimes people pull out AXES... it's so scary! Could you show me how to get away from one? Please?",
    waiting: 'When someone gets an axe, run! Hold Shift!', ready: "You got away! You're so brave... and fast!",
    reward: ['scaredycat', 'hideandseek'],
  },
  {
    id: 'sledge', title: 'Hammer Time', giver: 'crumbs', after: 'joyride', event: 'knockout', match: (p) => p.weapon === 'sledge', goal: 3,
    desc: 'Knock out 3 people with the Sledgehammer (Hank the Hardware Guy sells one).',
    offer: 'Arr, a proper pirate swings a BIG hammer! Bonk three landlubbers with a sledgehammer and I will teach ye to leap like a flyin fish!',
    waiting: 'The sledgehammer, matey! Hank has one!', ready: 'Arr! Now jump to the crows nest, ye scallywag!',
    reward: ['ab_superjump'],
  },
  {
    id: 'audition', title: 'The Audition', giver: 'dolores', after: 'rivals', event: 'knockout', setKey: 'personality', goal: 6,
    desc: 'Knock out one of every type of person: Grumpy, Cheerful, Shy, Dramatic, Pirate-ish and Robot-ish.',
    offer: 'I am casting my new show and need EVERY type of person! Bonk one of each, darling. All six!',
    waiting: 'One of every type, darling! The cast is not complete!', ready: 'The cast is complete! You will be a STAR!',
    reward: ['starring', 'autograph'],
  },
  {
    id: 'reach', title: 'Reach Test', giver: 'unit7', after: 'survey', event: 'knockout', match: (p) => p.weapon === 'katana', goal: 3,
    desc: 'Knock out 3 people with the Katana (Madame Mei sells one).',
    offer: 'BEEP. Analysis: your arms are too short. Knock out three humans with a katana and I will install an upgrade.',
    waiting: 'Katana knockouts required: three.', ready: 'Upgrade installed. Your arms can now extend. Do not hug anyone.',
    reward: ['ab_longarms'],
  },
  {
    id: 'bully', title: 'Peace and Quiet', giver: 'gary', after: 'roadrage', event: 'knockout', goal: 10,
    desc: 'Knock out 10 people. Any way you like.',
    offer: 'This town is too LOUD. Knock out ten people. Then it will finally be quiet. I will make it worth your while.',
    waiting: 'Still noisy. Ten knockouts.', ready: 'Ahh. Silence. Here. Knock everyone down at once next time.',
    reward: ['ab_bonkwave'],
  },
];
export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export class QuestManager {
  constructor() {
    this.state = {};
    for (const q of QUESTS) this.state[q.id] = { status: 'available', progress: 0, set: [] };
    this.onChange = null;      // () => void
    this.onToast = null;       // (text, kind) => void
    this.onUnlock = null;      // (lineIds) => void
  }

  serialize() { return JSON.parse(JSON.stringify(this.state)); }

  load(data) {
    if (!data) return;
    for (const q of QUESTS) {
      const s = data[q.id];
      if (s && ['available', 'active', 'ready', 'done'].includes(s.status)) {
        this.state[q.id] = { status: s.status, progress: Number(s.progress) || 0, set: Array.isArray(s.set) ? s.set.slice() : [] };
      }
    }
  }

  /** A quest whose `after` quest is not turned in yet is locked. */
  isLocked(q) { return !!q.after && this.state[q.after].status !== 'done'; }

  /** The giver's current quest: the first one not done (and not locked), or their last quest once all are done. */
  forGiver(giverId) {
    const list = QUESTS.filter((q) => q.giver === giverId);
    return list.find((q) => this.state[q.id].status !== 'done' && !this.isLocked(q)) || list[list.length - 1];
  }
  activeQuests() { return QUESTS.filter((q) => ['active', 'ready'].includes(this.state[q.id].status)); }

  accept(id) {
    const s = this.state[id];
    if (s.status !== 'available') return false;
    s.status = 'active';
    this.onToast?.(`Quest accepted: ${QUEST_BY_ID[id].title}`, 'quest');
    this.onChange?.();
    return true;
  }

  turnIn(id) {
    const s = this.state[id];
    if (s.status !== 'ready') return false;
    s.status = 'done';
    const q = QUEST_BY_ID[id];
    this.onChange?.();
    this.onToast?.(`Quest complete: ${q.title}`, 'quest');
    this.onUnlock?.(q.reward);
    return true;
  }

  /**
   * Report a game event.
   * - q.match(payload): only count events that pass this check
   * - q.setKey: count distinct payload[setKey] values (e.g. different people / weapons)
   * - payload.amount: add this much instead of 1 (e.g. metres driven)
   */
  emit(event, payload = {}) {
    for (const q of QUESTS) {
      const s = this.state[q.id];
      if (s.status !== 'active' || q.event !== event) continue;
      if (q.match && !q.match(payload)) continue;
      if (q.setKey) {
        const key = payload[q.setKey];
        if (!key || s.set.includes(key)) continue;
        s.set.push(key);
        s.progress = s.set.length;
      } else {
        s.progress = Math.min(q.goal, s.progress + (payload.amount ?? 1));
      }
      if (s.progress >= q.goal) {
        s.status = 'ready';
        this.onToast?.(`${q.title}: objective done! Return to the quest giver.`, 'quest');
      }
      this.onChange?.();
    }
  }

  progressText(q) {
    const s = this.state[q.id];
    return q.goal > 1 ? `${Math.floor(Math.min(s.progress, q.goal))}/${q.goal}` : (s.status === 'ready' || s.status === 'done' ? 'done' : '0/1');
  }
}

export function lineText(id) { return LINE_BY_ID[id]?.text || id; }
