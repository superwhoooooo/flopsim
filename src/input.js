export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseHeld = false;
  }
  down(code) { return this.keys.has(code); }
  clear() { this.keys.clear(); this.mouseHeld = false; this.rightHeld = false; }
}
