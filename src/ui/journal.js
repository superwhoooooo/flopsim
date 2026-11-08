// Journal (J): quest log + unlocked lines. Click a line, then click a hotbar slot (or drag it onto a slot).
import { LINES } from '../dialogue/lines.js';
import { SLOT_KEYS } from '../dialogue/hotbar.js';
import { QUESTS, QUEST_BY_ID, lineText } from '../quests/quests.js';
import { sfx } from '../audio.js';

export class Journal {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.selected = null;
    this.el = document.getElementById('journal');
    this.el.innerHTML = `
      <div class="jr-box">
        <div class="jr-head"><h2>Journal</h2><button id="jrClose">Close (J)</button></div>
        <div class="jr-cols">
          <section class="jr-quests"><h3>Quests</h3><div id="jrQuestList"></div></section>
          <section class="jr-lines">
            <h3>Dialogue lines</h3>
            <p class="jr-help">Click a line, then click a hotbar slot (or drag the line onto a slot). Press the slot's number in the game to say it.</p>
            <div id="jrHotbar" class="jr-hotbar"></div>
            <div id="jrLineList" class="jr-linelist"></div>
          </section>
        </div>
      </div>`;
    this.el.querySelector('#jrClose').addEventListener('click', () => game.toggleJournal(false));
    this.questList = this.el.querySelector('#jrQuestList');
    this.hotbarEl = this.el.querySelector('#jrHotbar');
    this.lineList = this.el.querySelector('#jrLineList');
  }

  show(v) {
    this.open = v;
    this.el.classList.toggle('open', v);
    if (v) this.render();
  }

  render() {
    if (!this.open) return;
    const g = this.game;
    // quests
    this.questList.innerHTML = QUESTS.map((q) => {
      const s = g.quests.state[q.id];
      const giver = g.giverName(q.giver);
      const status = { available: 'Not started', active: 'In progress', ready: 'Ready to turn in', done: 'Completed' }[s.status];
      const rew = q.reward.map((id) => `"${lineText(id)}"`).join(', ');
      return `<div class="jr-quest ${s.status}">
        <div class="jr-qtitle">${q.title} <span class="jr-qstat">${status}${s.status === 'active' || s.status === 'ready' ? ' &middot; ' + g.quests.progressText(q) : ''}</span></div>
        <div class="jr-qdesc">${q.desc}</div>
        <div class="jr-qmeta">Given by ${giver}. Unlocks: ${s.status === 'available' ? q.reward.length + ' line(s)' : rew}</div>
      </div>`;
    }).join('');
    // hotbar
    this.hotbarEl.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const id = g.dialogue.lineAt(i);
      const d = document.createElement('div');
      d.className = 'jr-slot' + (id ? '' : ' empty');
      d.innerHTML = `<span class="key">${SLOT_KEYS[i]}</span><span class="txt">${id ? lineText(id) : '(empty)'}</span>${id ? '<button class="x" title="Clear slot">&times;</button>' : ''}`;
      d.addEventListener('click', (e) => {
        if (e.target.classList.contains('x')) { g.dialogue.clear(i); return; }
        if (this.selected) { if (g.dialogue.assign(i, this.selected)) sfx.equip(); this.selected = null; }
      });
      d.addEventListener('dragover', (e) => { e.preventDefault(); d.classList.add('over'); });
      d.addEventListener('dragleave', () => d.classList.remove('over'));
      d.addEventListener('drop', (e) => {
        e.preventDefault(); d.classList.remove('over');
        const lid = e.dataTransfer.getData('text/plain');
        if (lid && g.dialogue.assign(i, lid)) sfx.equip();
      });
      this.hotbarEl.appendChild(d);
    }
    // lines
    this.lineList.innerHTML = '';
    for (const l of LINES) {
      const unlocked = g.dialogue.isUnlocked(l.id);
      const d = document.createElement('div');
      d.className = 'jr-line' + (unlocked ? '' : ' locked') + (this.selected === l.id ? ' sel' : '');
      if (unlocked) {
        const slot = g.dialogue.slots.indexOf(l.id);
        d.innerHTML = `<span>${l.text}</span>${slot >= 0 ? `<span class="badge">${SLOT_KEYS[slot]}</span>` : ''}`;
        d.draggable = true;
        d.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', l.id); this.selected = l.id; });
        d.addEventListener('click', () => { this.selected = this.selected === l.id ? null : l.id; sfx.pop(); this.render(); });
      } else {
        const q = QUESTS.find((qq) => qq.reward.includes(l.id));
        d.innerHTML = `<span>??? locked</span><span class="badge">${q ? q.title : ''}</span>`;
      }
      this.lineList.appendChild(d);
    }
  }
}
