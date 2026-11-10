export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseHeld = false;
    this.stick = { x: 0, y: 0 };   // analog move from the touch stick: x right, y forward (-1..1)
  }
  down(code) { return this.keys.has(code); }
  clear() { this.keys.clear(); this.mouseHeld = false; this.rightHeld = false; this.stick.x = 0; this.stick.y = 0; }
}
