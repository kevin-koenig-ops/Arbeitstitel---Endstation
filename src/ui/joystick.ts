// Virtueller Joystick (unten links) und Benutzen-Taste (unten rechts).
// Der Joystick liefert eine Richtung im Bildschirm: x nach rechts, y nach unten, Länge 0 bis 1.

import { h } from './dom';

export class Joystick {
  readonly el: HTMLElement;
  private knob: HTMLElement;
  private id: number | null = null;
  private cx = 0;
  private cy = 0;
  readonly value = { x: 0, y: 0 };
  private radius = 46;

  constructor() {
    this.knob = h('div', { class: 'joy-knob' });
    this.el = h('div', { class: 'joystick', role: 'application', 'aria-label': 'Joystick: Figur bewegen' }, h('div', { class: 'joy-base' }), this.knob);
    this.el.addEventListener('pointerdown', (e) => {
      if (this.id !== null) return;
      e.preventDefault();
      e.stopPropagation();
      this.id = e.pointerId;
      this.el.setPointerCapture(e.pointerId);
      const r = this.el.getBoundingClientRect();
      this.cx = r.left + r.width / 2;
      this.cy = r.top + r.height / 2;
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
      this.id = null;
      this.value.x = this.value.y = 0;
      this.knob.style.transform = '';
      this.el.classList.remove('active');
    };
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
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

/** Runde Benutzen-Taste mit wechselnder Beschriftung. */
export function useButton(onUse: () => void): { el: HTMLButtonElement; setLabel: (label: string | null) => void } {
  const label = h('span', { class: 'use-label' }, 'Benutzen');
  const el = h('button', { class: 'use-btn', type: 'button', 'aria-label': 'Benutzen' }, h('span', { class: 'use-dot' }), label);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onUse();
  });
  return {
    el,
    setLabel: (text) => {
      label.textContent = text ?? 'Benutzen';
      el.classList.toggle('idle', !text);
      el.setAttribute('aria-label', text ?? 'Benutzen');
    },
  };
}
