// Journal (J): quest log + unlocked lines. Click a line, then click a hotbar slot (or drag it onto a slot).
import { LINES, LINE_BY_ID } from '../dialogue/lines.js';
import { SLOT_KEYS } from '../dialogue/hotbar.js';
import { QUESTS, QUEST_BY_ID, lineText } from '../quests/quests.js';
import { sfx } from '../audio.js';
import { FEATS, RANKS } from '../discovery/feats.js';
import { HATS } from '../discovery/hats.js';
import { regionOf } from '../discovery/discovery.js';

export class Journal {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.selected = null;
    this.el = document.getElementById('journal');
    this.el.innerHTML = `
      <div class="jr-box">
        <div class="jr-head"><h2>Journal</h2>
          <div class="jr-tabs"><button data-tab="quests">Quests &amp; Lines</button><button data-tab="feats">Feats</button><button data-tab="collection">Collection</button><button data-tab="gear">Gear</button><button data-tab="challenges">Challenges</button></div>
          <button id="jrClose">Close (J)</button></div>
        <div class="jr-pane" data-pane="feats"></div>
        <div class="jr-pane" data-pane="collection"></div>
        <div class="jr-pane" data-pane="gear"></div>
        <div class="jr-pane" data-pane="challenges"></div>
        <div class="jr-cols jr-pane" data-pane="quests">
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
    this.tab = 'quests';
    this.el.querySelectorAll('.jr-tabs button').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.tab; sfx.pop(); this.render(); }));
    this.featsEl = this.el.querySelector('[data-pane="feats"]');
    this.collEl = this.el.querySelector('[data-pane="collection"]');
  }

  show(v) {
    this.open = v;
    this.el.classList.toggle('open', v);
    if (v) this.render();
  }

  render() {
    if (!this.open) return;
    const g = this.game;
    this.el.querySelectorAll('.jr-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    this.el.querySelectorAll('.jr-pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === this.tab));
    if (this.tab === 'feats') { this.renderFeats(); return; }
    if (this.tab === 'collection') { this.renderCollection(); return; }
    if (this.tab === 'gear') { g.fun?.renderGear(this.el.querySelector('[data-pane="gear"]')); return; }
    if (this.tab === 'challenges') { g.fun?.renderChallenges(this.el.querySelector('[data-pane="challenges"]')); return; }
    // quests
    this.questList.innerHTML = QUESTS.map((q) => {
      const s = g.quests.state[q.id];
      const giver = g.giverName(q.giver);
      const locked = g.quests.isLocked(q);
      const status = locked ? `Locked: finish "${QUEST_BY_ID[q.after].title}" first` : { available: 'Not started', active: 'In progress', ready: 'Ready to turn in', done: 'Completed' }[s.status];
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
      d.className = 'jr-slot' + (id ? '' : ' empty') + (id && LINE_BY_ID[id]?.ability ? ' ability' : '');
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
      d.className = 'jr-line' + (unlocked ? '' : ' locked') + (this.selected === l.id ? ' sel' : '') + (l.ability ? ' ability' : '');
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

  renderFeats() {
    const D = this.game.discovery;
    const done = FEATS.filter((f) => D.feats.has(f.id)).length;
    this.featsEl.innerHTML = `<p class="jr-help">${done} / ${FEATS.length} feats. Secret feats show a riddle until you stumble onto them.</p><div class="jr-feats">`
      + FEATS.map((f) => {
        const has = D.feats.has(f.id);
        const name = has || !f.secret ? f.name : '???';
        const text = has ? (f.done || f.hint) : f.hint;
        return `<div class="jr-feat ${has ? 'done' : ''} ${f.secret && !has ? 'secret' : ''}"><div class="jf-name">${has ? '🏆 ' : ''}${name}<span class="jf-pts">+${f.pts}</span></div><div class="jf-text">${text}</div></div>`;
      }).join('') + '</div>';
  }

  renderCollection() {
    const D = this.game.discovery;
    const ri = D.rankIndex(), next = RANKS[ri + 1];
    const ranks = RANKS.map((r, i) => `<div class="jr-rank ${i <= ri ? 'got' : ''} ${i === ri ? 'cur' : ''}"><b>${r.name}</b><span>${r.pts.toLocaleString()} pts</span></div>`).join('');
    this.collEl.innerHTML = `
      <div class="jr-coll">
        <section>
          <h3>Flop Rank</h3>
          <p class="jr-help">★ ${D.points.toLocaleString()} Flop Points. ${next ? `${(next.pts - D.points).toLocaleString()} more to <b>${next.name}</b>.` : 'You are a legend.'}
            Earn points by flopping (tumbling far), airtime, bonk combos, quests, feats, ducks and new places.</p>
          <div class="jr-ranks">${ranks}</div>
          <h3>Hats <small>(click to wear, or press H in game)</small></h3>
          <div class="jr-hats">${HATS.map((h) => {
            const own = D.hats.has(h.id);
            return `<div class="jr-hat ${own ? 'own' : 'locked'} ${D.hat === h.id ? 'on' : ''}" data-hat="${h.id}"><span class="hi">${own ? h.icon : '🔒'}</span><b>${h.name}</b><small>${own ? (D.hat === h.id ? 'Wearing' : 'Click to wear') : h.from}</small></div>`;
          }).join('')}</div>
        </section>
        <section>
          <h3>Places <small>${D.landmarks.size}/${D.landmarkList.length}</small></h3>
          <div class="jr-places">${D.landmarkList.map((l) => `<span class="${D.landmarks.has(l.id) ? 'got' : ''}">${D.landmarks.has(l.id) ? l.name : '??? ' + regionOf(l.x, l.z)}</span>`).join('')}</div>
          <h3>Golden Ducks <small>${D.ducksFound.size}/${D.duckTotal}</small></h3>
          <p class="jr-help">Ducks quack when you get close. Some are up high. Some are... not on land.</p>
          <div class="jr-ducks">${D.ducks.map((d) => D.ducksFound.has(d.i)
            ? `<div class="got">🦆 <span>${d.where}</span></div>`
            : `<div>❔ <span>Somewhere ${regionOf(d.x, d.z)}${d.y > 4 ? ', up high' : ''}</span></div>`).join('')}</div>
        </section>
      </div>`;
    this.collEl.querySelectorAll('.jr-hat.own').forEach((el) => el.addEventListener('click', () => { D.setHat(el.dataset.hat); this.render(); }));
  }
}
