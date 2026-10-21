// Schauplatz wählen: zum Start einer von drei, weitere findet man draußen als Lageplan.

import { SITE_ORDER, SITES, type SiteId } from '../../core/building';
import { siteStatus } from '../../core/rules';
import type { SpotKind } from '../../core/types';
import type { App } from '../app';
import { h, svgEl } from '../dom';
import { artStyle } from '../art';
import { icon } from '../icons';

const FIND_NAMES: Partial<Record<SpotKind, string>> = {
  stop: 'Bushaltestellen',
  well: 'Brunnen',
  shed: 'Gartenlauben',
  hide: 'Hochsitzen',
  fuel: 'Tankstellen',
  car: 'Autowracks',
  parcel: 'Packstationen',
};

/** Kleine Landschaftsbilder für die Karten (eigene Zeichnungen). */
const ART: Record<SiteId, string> = {
  depot: `<rect width="160" height="90" fill="#3a3630"/><rect y="58" width="160" height="32" fill="#4f4c46"/>
    <path d="M10 58V30h70v28" fill="#6a665c"/><path d="M8 30h74l-6-8H14z" fill="#5a5e5c"/><path d="M20 58V40h12v18M38 58V40h12v18M56 58V40h12v18" fill="#1d1c1a"/>
    <rect x="92" y="44" width="58" height="18" rx="3" fill="#b9ac8a"/><rect x="96" y="47" width="44" height="7" fill="#232421"/><rect x="141" y="47" width="6" height="7" fill="#ffb22e"/>
    <circle cx="102" cy="63" r="3.5" fill="#161614"/><circle cx="140" cy="63" r="3.5" fill="#161614"/><path d="M0 74h160" stroke="#c9c4b4" stroke-dasharray="8 6"/>`,
  farm: `<rect width="160" height="90" fill="#7a6a4a"/><rect y="52" width="160" height="38" fill="#6b7240"/>
    <path d="M0 64h160M0 72h160M0 80h160" stroke="#5a4632" stroke-width="3"/><path d="M18 52V32l18-12 18 12v20z" fill="#8a3a2a"/><path d="M14 33l22-15 22 15" stroke="#4a3a2a" stroke-width="4" fill="none"/>
    <rect x="30" y="40" width="12" height="12" fill="#2a2420"/><rect x="66" y="22" width="14" height="30" rx="2" fill="#8a8a80"/><path d="M64 22l9-7 9 7z" fill="#6a6a60"/>
    <circle cx="118" cy="38" r="12" fill="#4f6b3a"/><rect x="116" y="44" width="4" height="10" fill="#5a3f28"/><circle cx="140" cy="44" r="8" fill="#5d7a42"/>`,
  lake: `<rect width="160" height="90" fill="#46525e"/><path d="M0 34l30-16 25 10 30-14 35 12 40-10v18H0z" fill="#52606a"/>
    <rect y="36" width="160" height="22" fill="#2f4a52"/><path d="M10 44h30M70 48h40M120 42h28" stroke="#5a7a82" stroke-width="1.5"/><rect y="56" width="160" height="34" fill="#3f4a2e"/>
    <rect x="60" y="40" width="7" height="20" fill="#8a6a45"/><path d="M14 80l8-24 8 24zM28 84l9-28 9 28zM118 82l8-26 8 26zM134 86l9-30 9 30z" fill="#2f4a34"/>
    <circle cx="96" cy="70" r="4" fill="#ff9a4a"/>`,
  fuel: `<rect width="160" height="90" fill="#6a6a52"/><rect y="66" width="160" height="16" fill="#3a3936"/><path d="M0 74h160" stroke="#d8d2c2" stroke-dasharray="10 8"/>
    <rect x="20" y="22" width="80" height="7" fill="#e8e2d0"/><rect x="20" y="28" width="80" height="3" fill="#b0472f"/><rect x="26" y="31" width="4" height="35" fill="#d8d2c2"/><rect x="90" y="31" width="4" height="35" fill="#d8d2c2"/>
    <rect x="46" y="44" width="8" height="18" fill="#c9c4b4"/><rect x="46" y="44" width="8" height="5" fill="#b0472f"/><rect x="64" y="44" width="8" height="18" fill="#c9c4b4"/><rect x="64" y="44" width="8" height="5" fill="#b0472f"/>
    <rect x="128" y="14" width="4" height="52" fill="#8a8476"/><rect x="118" y="14" width="24" height="16" fill="#e8e2d0"/><rect x="118" y="14" width="24" height="5" fill="#b0472f"/>`,
  allotment: `<rect width="160" height="90" fill="#5f7038"/><path d="M0 50h160" stroke="#a0957e" stroke-width="6"/>
    <rect x="6" y="14" width="66" height="6" rx="3" fill="#3f5a34"/><rect x="88" y="14" width="66" height="6" rx="3" fill="#3f5a34"/>
    <path d="M22 44V30l12-8 12 8v14z" fill="#7a9a8a"/><path d="M19 31l15-10 15 10" stroke="#5a4632" stroke-width="3" fill="none"/><path d="M104 44V32l10-7 10 7v12z" fill="#c9b88a"/>
    <circle cx="140" cy="34" r="9" fill="#4f6b3a"/><circle cx="66" cy="38" r="2.5" fill="#e6c13a"/><circle cx="60" cy="40" r="2.5" fill="#b0472f"/><circle cx="72" cy="41" r="2.5" fill="#8a5aa8"/>
    <rect x="20" y="62" width="40" height="8" fill="#6b4a2e"/><rect x="100" y="62" width="40" height="8" fill="#6b4a2e"/><path d="M26 61v-4M34 61v-5M42 61v-4M50 61v-5M106 61v-4M114 61v-5M122 61v-4M130 61v-5" stroke="#5d7a42" stroke-width="3"/>`,
};

export function siteArt(site: SiteId): string {
  return `<svg viewBox="0 0 160 90" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${ART[site]}</svg>`;
}

export function openSitePicker(app: App, host: HTMLElement, opts: { first: boolean; onChosen: (site: SiteId) => void; onClose?: () => void }): HTMLElement {
  const s = app.backend.current()!;
  const close = () => {
    el.remove();
    opts.onClose?.();
  };
  const sites = SITE_ORDER.filter((id) => !opts.first || SITES[id].start);
  const cards = sites.map((id) => {
    const def = SITES[id];
    const status = siteStatus(s, id);
    const active = s.base.active === id;
    const hint = def.findAt.map((k) => FIND_NAMES[k]).filter(Boolean).join(' oder ');
    let label = '';
    let disabled = false;
    if (opts.first) label = 'Hier einziehen';
    else if (active) {
      label = 'Hier wohnst du';
      disabled = true;
    } else if (status === 'home') label = 'Hierher wechseln';
    else if (status === 'found') label = 'Lageplan gefunden: einziehen';
    else {
      label = `Lageplan an ${hint}`;
      disabled = true;
    }
    return h(
      'article',
      { class: 'site-card' + (status === 'hidden' && !opts.first ? ' locked' : '') + (active ? ' active' : '') },
      h('div', { class: 'site-art' }, svgEl(siteArt(id)), status === 'hidden' && !opts.first ? svgEl(icon('lock', 22), 'site-lock') : null),
      h('div', { class: 'site-text' }, h('h3', null, def.name), h('small', null, def.where), h('p', null, def.desc)),
      h(
        'button',
        {
          class: 'btn small' + (disabled ? ' ghost' : ''),
          type: 'button',
          disabled,
          onclick: () => {
            el.remove();
            opts.onChosen(id);
          },
        },
        label,
      ),
    );
  });
  const el = h(
    'div',
    { class: 'overlay site-picker has-art', style: artStyle('home'), role: 'dialog', 'aria-label': 'Schauplatz wählen' },
    h(
      'div',
      { class: 'overlay-inner' },
      h(
        'header',
        { class: 'topbar' },
        opts.first ? null : h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Schließen', onclick: close }, svgEl(icon('close'))),
        h('h1', { class: 'sign-title' }, opts.first ? 'Wo baust du?' : 'Schauplätze'),
      ),
      h(
        'p',
        { class: 'site-lead' },
        opts.first
          ? 'Such dir einen Ort für deine Endstation aus. Die anderen findest du später draußen als Lageplan.'
          : 'Jeder Schauplatz ist ein eigenes Gelände. Was du gebaut hast, bleibt stehen, auch wenn du wechselst.',
      ),
      h('div', { class: 'site-list' }, cards),
    ),
  );
  host.append(el);
  return el;
}
