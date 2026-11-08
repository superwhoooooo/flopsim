// Unlocked lines + the 10-slot hotbar (keys 1..9, 0).
import { LINES, LINE_BY_ID, START_LINES } from './lines.js';

export const SLOT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export class DialogueState {
  constructor() {
    this.unlocked = new Set(START_LINES);
    this.slots = new Array(10).fill(null);
    START_LINES.forEach((id, i) => { this.slots[i] = id; });
    this.onChange = null;
  }

  isUnlocked(id) { return this.unlocked.has(id); }

  unlock(ids) {
    const added = [];
    for (const id of ids) if (LINE_BY_ID[id] && !this.unlocked.has(id)) { this.unlocked.add(id); added.push(id); }
    if (added.length) this.onChange?.();
    return added;
  }

  assign(slot, id) {
    if (slot < 0 || slot > 9 || !this.unlocked.has(id)) return false;
    const prev = this.slots.indexOf(id);
    if (prev >= 0) this.slots[prev] = this.slots[slot];   // swap if already placed elsewhere
    this.slots[slot] = id;
    this.onChange?.();
    return true;
  }

  clear(slot) { this.slots[slot] = null; this.onChange?.(); }
  lineAt(slot) { return this.slots[slot]; }

  serialize() { return { unlocked: [...this.unlocked], hotbar: this.slots.slice() }; }

  load(d) {
    if (!d) return;
    if (Array.isArray(d.unlocked)) {
      for (const id of d.unlocked) if (LINE_BY_ID[id]) this.unlocked.add(id);
    }
    if (Array.isArray(d.hotbar)) {
      this.slots = new Array(10).fill(null);
      d.hotbar.slice(0, 10).forEach((id, i) => { this.slots[i] = id && this.unlocked.has(id) ? id : null; });
    }
  }
}

export { LINES };
