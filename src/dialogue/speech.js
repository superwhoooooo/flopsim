// Speech bubbles / name labels using CSS2DRenderer objects attached to ragdoll anchors.
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export class Speech {
  constructor() {
    this.active = new Map(); // anchor.uuid -> { obj, anchor, time }
  }

  say(anchor, text, duration = 2.6, cls = '') {
    this.clear(anchor);
    const el = document.createElement('div');
    el.className = 'bubble ' + cls;
    el.textContent = text;
    const obj = new CSS2DObject(el);
    obj.position.set(0, 0.12, 0);
    anchor.add(obj);
    this.active.set(anchor.uuid, { obj, anchor, time: duration });
  }

  clear(anchor) {
    const a = this.active.get(anchor.uuid);
    if (a) {
      a.anchor.remove(a.obj);
      if (a.obj.element.parentNode) a.obj.element.parentNode.removeChild(a.obj.element);
      this.active.delete(anchor.uuid);
    }
  }

  update(dt) {
    for (const [k, a] of this.active) {
      a.time -= dt;
      if (a.time < 0.35) a.obj.element.style.opacity = String(Math.max(0, a.time / 0.35));
      if (a.time <= 0) this.clear(a.anchor);
    }
  }
}

// Persistent label above a quest giver ("!" / "?" + name)
export function makeNameTag(anchor, name) {
  const el = document.createElement('div');
  el.className = 'nametag';
  const mark = document.createElement('span'); mark.className = 'qmark';
  const nm = document.createElement('span'); nm.className = 'qname'; nm.textContent = name;
  el.append(mark, nm);
  const obj = new CSS2DObject(el);
  obj.position.set(0, 0.62, 0);
  anchor.add(obj);
  return {
    setMark(m) { mark.textContent = m; mark.style.display = m ? 'block' : 'none'; mark.dataset.kind = m; },
    obj,
  };
}
