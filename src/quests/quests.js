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
    id: 'chat', title: 'Chatterbox', giver: 'gary', event: 'sayTo', goal: 6,
    desc: 'Say a line to every personality: Grumpy, Cheerful, Shy, Dramatic, Pirate-ish and Robot-ish.',
    offer: 'Tch. Talk to every kind of person in this town. All six types. Then maybe I will be impressed.',
    waiting: 'Still need to chat with every type of person.', ready: 'Fine. You are a proper chatterbox. Take these.',
    reward: ['goodbye', 'secret', 'highfive'],
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

  forGiver(giverId) { return QUESTS.find((q) => q.giver === giverId); }
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

  /** Report a game event. payload.key is used for set-style quests (sayTo). */
  emit(event, payload = {}) {
    for (const q of QUESTS) {
      const s = this.state[q.id];
      if (s.status !== 'active' || q.event !== event) continue;
      if (event === 'sayTo') {
        if (payload.key && !s.set.includes(payload.key)) s.set.push(payload.key);
        s.progress = s.set.length;
      } else {
        s.progress = Math.min(q.goal, s.progress + 1);
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
    return q.goal > 1 ? `${Math.min(s.progress, q.goal)}/${q.goal}` : (s.status === 'ready' || s.status === 'done' ? 'done' : '0/1');
  }
}

export function lineText(id) { return LINE_BY_ID[id]?.text || id; }
