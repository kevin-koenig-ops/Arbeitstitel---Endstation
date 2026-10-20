// Virtueller Joystick (unten links) und Benutzen-Taste (unten rechts).
// Der Joystick liefert eine Richtung im Bildschirm: x nach rechts, y nach unten, Länge 0 bis 1.
// Er hat eine große, unsichtbare Fläche: Wer etwas daneben drückt, bekommt den Joystick
// genau unter den Daumen, statt aus Versehen die Ansicht zu verschieben.

import { h } from './dom';

export class Joystick {
  readonly el: HTMLElement;
  private ring: HTMLElement;
  private knob: HTMLElement;
  private id: number | null = null;
  private cx = 0;
  private cy = 0;
  readonly value = { x: 0, y: 0 };
  private radius = 46;

  constructor() {
    this.knob = h('div', { class: 'joy-knob' });
    this.ring = h('div', { class: 'joy-ring' }, h('div', { class: 'joy-base' }), this.knob);
    this.el = h('div', { class: 'joystick', role: 'application', 'aria-label': 'Joystick: Figur bewegen' }, this.ring);
    this.el.addEventListener('pointerdown', (e) => {
      if (this.id !== null) return;
      e.preventDefault();
      e.stopPropagation();
      this.id = e.pointerId;
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* egal */
      }
      // Ruhelage des Joysticks
      const r = this.ring.getBoundingClientRect();
      const rx = r.left + r.width / 2;
      const ry = r.top + r.height / 2;
      if (Math.hypot(e.clientX - rx, e.clientY - ry) <= r.width * 0.55) {
        this.cx = rx;
        this.cy = ry;
      } else {
        // Daneben gedrückt: Joystick springt unter den Daumen
        this.cx = e.clientX;
        this.cy = e.clientY;
        this.ring.style.transform = `translate(${e.clientX - rx}px, ${e.clientY - ry}px)`;
      }
      this.move(e.clientX, e.clientY);
      this.el.classList.add('active');
    });
    this.el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.id) return;
      e.preventDefault();
      this.move(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.id) return;
      this.release();
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
    this.el.addEventListener('lostpointercapture', end);
  }

  private release() {
    this.id = null;
    this.value.x = this.value.y = 0;
    this.knob.style.transform = '';
    this.ring.style.transform = '';
    this.el.classList.remove('active');
  }

  private move(x: number, y: number) {
    let dx = x - this.cx;
    let dy = y - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) {
      dx = (dx / d) * this.radius;
      dy = (dy / d) * this.radius;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const len = Math.min(1, d / this.radius);
    // kleine tote Zone in der Mitte
    const k = len < 0.15 ? 0 : (len - 0.15) / 0.85;
    const n = d || 1;
    this.value.x = (dx / n) * k;
    this.value.y = (dy / n) * k;
  }

  get active() {
    return this.value.x !== 0 || this.value.y !== 0;
  }
}

/** Runde Benutzen-Taste mit wechselnder Beschriftung. Reagiert sofort beim Drücken. */
export function useButton(onUse: () => void): { el: HTMLButtonElement; setLabel: (label: string | null) => void } {
  const label = h('span', { class: 'use-label' }, 'Benutzen');
  const el = h('button', { class: 'use-btn', type: 'button', 'aria-label': 'Benutzen' }, h('span', { class: 'use-dot' }), label);
  // Sofort beim Drücken auslösen (auch während der andere Daumen den Joystick hält)
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('pressed');
    onUse();
  });
  const unpress = () => el.classList.remove('pressed');
  el.addEventListener('pointerup', unpress);
  el.addEventListener('pointercancel', unpress);
  el.addEventListener('pointerleave', unpress);
  // Tastatur (Enter/Leertaste) löst einen Klick ohne Zeiger aus
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.detail === 0) onUse();
  });
  return {
    el,
    setLabel: (text) => {
      if (label.textContent === (text ?? 'Benutzen') && el.classList.contains('idle') === !text) return;
      label.textContent = text ?? 'Benutzen';
      el.classList.toggle('idle', !text);
      el.setAttribute('aria-label', text ?? 'Benutzen');
    },
  };
}
