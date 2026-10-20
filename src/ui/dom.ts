// Minimaler Helfer, um DOM-Elemente zu bauen, ohne Framework.
//   h('button', { class: 'btn', onclick: () => ... }, 'Text')

export type Child = Node | string | number | null | undefined | false | Child[];

type Props = Record<string, unknown> & { class?: string; html?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Vertrauenswürdiges SVG-Markup (aus unserem eigenen Code) in ein Element verwandeln. */
export function svgEl(markup: string, cls?: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'svg' + (cls ? ' ' + cls : '');
  span.innerHTML = markup;
  return span;
}

export function clear(el: Element) {
  while (el.firstChild) el.firstChild.remove();
}

export const reducedMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
