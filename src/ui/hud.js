// HUD: crosshair, weapon label, quest tracker, hotbar, controls hint, toasts, interaction prompt.
import { LINE_BY_ID } from '../dialogue/lines.js';
import { SLOT_KEYS } from '../dialogue/hotbar.js';
import { WEAPONS } from '../weapons/weapons.js';
import { QUEST_BY_ID } from '../quests/quests.js';

export class Hud {
  constructor(game) {
    this.game = game;
    const root = document.getElementById('hud');
    root.innerHTML = `
      <div id="crosshair"></div>
      <div id="weaponLabel"></div>
      <div id="formBadge"></div>
      <div id="questTracker"></div>
      <div id="prompt"></div>
      <div id="toasts"></div>
      <div id="hotbar"></div>
      <div id="hint">
        <b>WASD</b> move &middot; <b>Shift</b> sprint &middot; <b>Space</b> jump &middot; <b>LMB</b> attack &middot;
        hold <b>Tab</b> weapons &middot; <b>1-0</b> speak &middot; <b>E</b> talk / take / drive &middot; <b>J</b> journal &middot;
        <b>B</b> animal skin &middot; <b>Q</b> ability &middot; <b>M</b> map &middot; <b>H</b> hat &middot; <b>K</b> 3rd person &middot; <b>L</b> 1st person &middot; <b>Esc</b> pause
      </div>
      <div id="camMode"></div>`;
    this.el = {
      crosshair: root.querySelector('#crosshair'),
      weapon: root.querySelector('#weaponLabel'),
      tracker: root.querySelector('#questTracker'),
      prompt: root.querySelector('#prompt'),
      toasts: root.querySelector('#toasts'),
      hotbar: root.querySelector('#hotbar'),
      camMode: root.querySelector('#camMode'),
      form: root.querySelector('#formBadge'),
    };
    this.slotEls = [];
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = `<span class="key">${SLOT_KEYS[i]}</span><span class="txt"></span>`;
      this.el.hotbar.appendChild(s);
      this.slotEls.push(s);
    }
  }

  setWeapon(id) {
    const w = WEAPONS[id];
    this.el.weapon.innerHTML = `<span class="wname" style="color:${w.color}">${w.name}</span><span class="whint">hold Tab to change</span>`;
  }

  setForm(p) {
    const f = p.form;
    this._formKey = null;
    this.el.form.innerHTML = `<span class="fi">${f.icon}</span><span class="fn">${f.name}</span>`
      + `<span class="fa">${f.ability ? `<b>Q</b> ${f.ability.name} <i></i>` : 'no ability'} &middot; <b>B</b> change skin</span>`;
    this._abi = this.el.form.querySelector('i');
  }

  /** Cheap per-frame refresh of the ability cooldown text. */
  tickForm(p) {
    if (!this._abi) return;
    const t = p.abilityCd > 0 ? `${p.abilityCd.toFixed(1)}s` : 'ready';
    if (t !== this._abiText) { this._abiText = t; this._abi.textContent = `(${t})`; this._abi.style.color = p.abilityCd > 0 ? '#ff9a7a' : '#8cff8c'; }
  }

  setCamMode(m) {
    this.el.camMode.textContent = m === 'first' ? 'First person (K for third)' : 'Third person (L for first)';
    this.el.camMode.classList.add('show');
    clearTimeout(this._cm);
    this._cm = setTimeout(() => this.el.camMode.classList.remove('show'), 1500);
    this.el.crosshair.classList.toggle('fp', m === 'first');
  }

  refreshHotbar() {
    const d = this.game.dialogue;
    this.slotEls.forEach((el, i) => {
      const id = d.lineAt(i);
      el.querySelector('.txt').textContent = id ? LINE_BY_ID[id].text : '';
      el.classList.toggle('empty', !id);
      el.classList.toggle('ability', !!(id && LINE_BY_ID[id].ability));
    });
  }

  flashSlot(i) {
    const el = this.slotEls[i];
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 250);
  }

  refreshQuests() {
    const qm = this.game.quests;
    const act = qm.activeQuests();
    if (!act.length) {
      this.el.tracker.innerHTML = '<div class="qt-title">Quests</div><div class="qt-empty">Find people with a <b class="bang">!</b> over their head.</div>';
      return;
    }
    this.el.tracker.innerHTML = '<div class="qt-title">Quests (J = journal)</div>' + act.map((q) => {
      const s = qm.state[q.id];
      const txt = s.status === 'ready' ? 'Return to the quest giver (?)' : q.desc.split('.')[0];
      return `<div class="qt-item ${s.status}"><div class="qt-name">${q.title} <span class="qt-prog">${qm.progressText(q)}</span></div><div class="qt-desc">${txt}</div></div>`;
    }).join('');
  }

  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = text;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3800);
  }

  unlockToast(lineIds) {
    for (const id of lineIds) {
      const l = LINE_BY_ID[id];
      this.toast(l.ability ? `New ability unlocked: ${l.text}!` : `New line unlocked: "${l.text}"`, 'unlock');
    }
  }

  setPrompt(text) {
    if (text === this._prompt) return;
    this._prompt = text;
    this.el.prompt.textContent = text || '';
    this.el.prompt.style.display = text ? 'block' : 'none';
  }
}
