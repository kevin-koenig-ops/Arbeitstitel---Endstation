// Untere Karte für eine Fundstelle: Infos, Durchsuchen, Fundbeleg.

import { BACKGROUNDS, CACHE, CART, CHAIN, COLLECTIBLES, COOK, DIG, ENEMIES, FIRST_FIND_FACTOR, HINT_NAMES, isMaterial, KRAM, LOOT_QUALITY, MEMENTOS, MIN_HEALTH_TO_FIGHT, NIGHT_HINT, RARITY, RESOURCE_ORDER, RESOURCES, SETS, SET_ORDER, SPECIAL_HINT, SPOT_KINDS, SPOT_STORIES, TIER, TRACK_LINES } from '../../core/content';
import { hashString } from '../../core/rng';
import { dayPhase } from '../../core/sun';
import { bearingDeg, distanceM, formatDistance } from '../../core/geo';
import { currentHealth, nextHealthIn, readyAt, regenMs, searchRangeM } from '../../core/rules';
import type { Cache, CollectibleId, GameEvent, Inventory, LatLon, Quality, Spot } from '../../core/types';
import type { Fix } from '../../services/location';
import type { App } from '../app';
import { append, clear, h, reducedMotion, sleep, svgEl } from '../dom';
import { icon, resIcon, spotIcon } from '../icons';
import { partsChips, thingThumb } from './chips';
import { REJECT_TEXT } from '../texts';
import { blueprintName, SITES } from '../../core/building';
import { enemySvg } from '../zombies';
import { GAME_FOR, playLootGame } from './lootGame';

/** Ein Satz zur Stimmung, fest pro Fundstelle. */
export function spotStory(spot: Spot): string {
  const list = SPOT_STORIES[spot.kind];
  return list[(hashString(spot.id) >>> 0) % list.length];
}

/** Bei Tag an manchen Orten: nachts ist hier mehr los. */
const NIGHT_KINDS = new Set(['hide', 'shed', 'container', 'heli', 'convoy', 'bunker', 'camp', 'mast']);

/** Himmelsrichtung in Worten (für Hinweise auf Verstecke). */
export function compassWord(deg: number): string {
  const names = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}


export function formatWait(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 60) return `${min} Min.`;
  const hrs = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${hrs} Std. ${rest} Min.` : `${hrs} Std.`;
}

interface Ctx {
  app: App;
  host: HTMLElement;
  getSpot: (id: string) => Spot | undefined;
  getFix: () => Fix | null;
  isSim: () => boolean;
  walkTo: (p: LatLon) => void;
  onChanged: () => void;
  /** Kampf an einer bewachten Fundstelle beginnen. */
  onFight: (spot: Spot) => void;
  /** Beim Wühlen zu laut gewesen: Der Kampf läuft schon (im Spielstand), nur noch anzeigen. */
  onAmbush: () => void;
  /** Wohin die Funde beim Einpacken fliegen (Rucksack-Knopf). */
  flyTarget?: () => Element | null;
}

export class SpotSheet {
  openId: string | null = null;
  private el: HTMLElement | null = null;
  private busy = false;
  /** Was die Karte gerade zeigt. Der Fundbeleg soll nicht von Updates überschrieben werden. */
  private mode: 'info' | 'receipt' = 'info';

  constructor(private ctx: Ctx) {}

  open(id: string) {
    if (this.busy) return;
    this.openId = id;
    this.mode = 'info';
    if (!this.el) {
      this.el = h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Fundstelle' });
      this.ctx.host.append(this.el);
    }
    this.render();
  }

  close() {
    if (this.busy) return;
    this.openId = null;
    this.el?.remove();
    this.el = null;
  }

  /** Bei neuem Standort aufrufen, damit Entfernung und Knopf aktuell bleiben. */
  refresh() {
    if (this.openId && !this.busy && this.mode === 'info') this.render();
  }

  private render() {
    const { app } = this.ctx;
    const spot = this.openId ? this.ctx.getSpot(this.openId) : undefined;
    const state = app.backend.current();
    if (!this.el || !spot || !state) return this.close();
    const def = SPOT_KINDS[spot.kind];
    const fix = this.ctx.getFix();
    const now = app.backend.now();
    const dist = fix ? distanceM(fix.pos, spot.pos) : Infinity;
    const range = searchRangeM(state);
    const inRange = dist <= range;
    const wait = readyAt(state, spot) - now;
    const guard = wait > 0 ? null : app.backend.guardFor(spot);
    const health = currentHealth(state, now);
    const cart = wait > 0 ? null : app.backend.cartFor(spot);
    // Besonderer Ort, noch nie da gewesen und noch zu weit weg: was es ist, siehst du erst vor Ort
    const hint = SPECIAL_HINT[spot.kind];
    const unknown = spot.source === 'special' && !state.discovered[spot.id] && !inRange;
    const nightHint = !unknown && NIGHT_KINDS.has(spot.kind) && dayPhase(spot.pos, now) !== 'night' && (hashString(`${spot.id}:nacht`) >>> 0) % 3 === 0;

    let status: string;
    let button: HTMLElement;
    if (wait > 0) {
      status = 'Schon durchsucht';
      button = h('button', { class: 'btn wide', type: 'button', disabled: true }, svgEl(icon('clock', 18)), `Wieder voll in ${formatWait(wait)}`);
    } else if (inRange && guard && health < MIN_HEALTH_TO_FIGHT) {
      status = 'In Reichweite';
      button = h('button', { class: 'btn wide', type: 'button', disabled: true }, `Zu angeschlagen · fit in ${formatWait(nextHealthIn(state, now) + (MIN_HEALTH_TO_FIGHT - health - 1) * regenMs(state))}`);
    } else if (inRange && guard) {
      status = 'In Reichweite';
      button = h('button', { class: 'btn wide danger', type: 'button', onclick: () => this.ctx.onFight(spot) }, 'Kämpfen');
    } else if (inRange) {
      status = 'In Reichweite';
      button = h('button', { class: 'btn wide', type: 'button', onclick: () => this.search(spot) }, 'Durchsuchen');
    } else if (this.ctx.isSim()) {
      status = `${formatDistance(dist)} entfernt`;
      button = h('button', { class: 'btn wide', type: 'button', onclick: () => this.ctx.walkTo(spot.pos) }, 'Hinlaufen');
    } else {
      status = fix ? `${formatDistance(dist)} entfernt` : 'Warte auf GPS …';
      button = h('button', { class: 'btn wide', type: 'button', disabled: true }, fix ? `Noch ${formatDistance(Math.max(0, dist - range))} näher ran` : 'Kein Standort');
    }

    // Die wahrscheinlichsten Funde (höchste Chance zuerst), dazu ob es Kram gibt
    const likely = [...def.loot].sort((a, b) => b.chance - a.chance).slice(0, 4).map((l) => l.res);
    clear(this.el);
    append(this.el, [
      h('button', { class: 'sheet-close iconbtn small', type: 'button', 'aria-label': 'Schließen', onclick: () => this.close() }, svgEl(icon('close', 18))),
      h(
        'div',
        { class: 'sheet-head' },
        h('span', { class: 'sheet-badge', 'data-source': spot.source, 'data-guard': guard ? '1' : '0', 'data-cart': cart ? '1' : '0' }, svgEl(cart ? icon('crate', 26) : unknown && hint ? icon(hint, 26) : spotIcon(spot.kind, 26))),
        h(
          'div',
          null,
          h(
            'div',
            { class: 'sheet-kicker' },
            cart ? `Händlerkiste · noch ${formatWait(cart.until - now)}` : unknown ? 'Unbekannt' : spot.source === 'special' ? 'Besonderer Ort' : spot.source === 'poi' ? 'Ort aus der Karte' : 'Fundstelle',
          ),
          h('h2', { class: 'sheet-title' }, unknown ? (hint ? HINT_NAMES[hint] : 'Etwas Unbekanntes') : spot.name),
        ),
      ),
      unknown ? null : h('p', { class: 'sheet-story' }, spotStory(spot)),
      guard
        ? h(
            'div',
            { class: 'guard-box' },
            svgEl(enemySvg(guard), 'guard-art'),
            h(
              'div',
              null,
              h('div', { class: 'guard-title' }, `Bewacht: ${ENEMIES[guard].name}, oft nicht allein`),
              h('p', null, `${ENEMIES[guard].desc} Wer gewinnt, findet hier mehr.`),
            ),
          )
        : cart
          ? h('p', { class: 'sheet-hint cart' }, `Ein Händlerkarren ist hier liegen geblieben. Viel mehr Beute als sonst (×${CART.lootFactor}), oft Kram und Sammelstücke. Nur für eine Weile.`)
          : unknown
            ? h('p', { class: 'sheet-hint' }, 'Was dort ist, siehst du erst vor Ort. Besondere Orte gibt es nur einmal pro Gegend, mit seltener Beute.')
            : h('p', { class: 'sheet-hint' }, def.hint, state.spots[spot.id] ? null : h('span', { class: 'first-tag' }, ` Noch nie durchsucht: doppelte Beute.`)),
      nightHint ? h('p', { class: 'sheet-hint small night' }, svgEl(icon('moon', 14)), NIGHT_HINT) : null,
      h(
        'div',
        { class: 'sheet-meta' },
        h(
          'span',
          { class: 'likely' },
          unknown ? h('span', { class: 'likely-chip' }, svgEl(icon('question', 16)), 'Unbekannt') : likely.map((r) => h('span', { class: 'likely-chip', title: RESOURCES[r].name }, svgEl(resIcon(r, 16)), RESOURCES[r].name)),
          !unknown && def.kramChance >= 0.2 ? h('span', { class: 'likely-chip junk', title: 'Kram zum Zerlegen' }, svgEl(icon('junk', 16)), 'Kram') : null,
        ),
        h('span', { class: 'sheet-status' + (inRange && wait <= 0 ? ' near' : '') }, status),
      ),
      button,
    ]);
  }

  private async search(spot: Spot) {
    const { app } = this.ctx;
    if (!this.ctx.getFix() || !this.el) return;
    this.busy = true;
    clear(this.el);
    let quality: Quality = 'good';
    if (app.settings.get().lootGames !== 'off') {
      const box = h('div', { class: 'searching game' });
      this.el.append(box);
      quality = await playLootGame(box, GAME_FOR[spot.kind]);
    } else {
      const bar = h('div', { class: 'progress-fill' });
      this.el.append(
        h(
          'div',
          { class: 'searching' },
          h('span', { class: 'sheet-badge', 'data-source': spot.source }, svgEl(spotIcon(spot.kind, 26))),
          h('div', { class: 'searching-text' }, `Durchsuche ${spot.name} …`),
          h('div', { class: 'progress' }, bar),
        ),
      );
      const ms = reducedMotion() ? 250 : 1100;
      bar.style.transitionDuration = `${ms}ms`;
      requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('full')));
      await sleep(ms);
    }
    // Erst jetzt zählt der Standort (man kann sich beim Spielen ja bewegt haben)
    const fix = this.ctx.getFix();
    if (!fix || !this.el) {
      this.busy = false;
      return;
    }
    const res = await app.backend.dispatch({ type: 'search', spot, at: fix.pos, accuracyM: fix.accuracyM, quality });
    this.busy = false;
    const ev = res.events[0];
    if (ev.type === 'loot') {
      this.ctx.onChanged();
      this.showReceipt(spot, ev);
    } else if (ev.type === 'rejected') {
      app.toast(REJECT_TEXT[ev.reason], 'warn');
      this.render();
    }
  }

  /** Fundbeleg zeigen (nach Durchsuchen oder nach gewonnenem Kampf). */
  showLoot(spot: Spot, ev: Extract<GameEvent, { type: 'loot' }>, note?: string) {
    this.openId = spot.id;
    if (!this.el) {
      this.el = h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Fundstelle' });
      this.ctx.host.append(this.el);
    }
    this.showReceipt(spot, ev, note);
  }

  /** Neues Sammelstück: groß zeigen, dazu wie weit das Set ist. */
  private collectibleNote(id: CollectibleId) {
    const state = this.ctx.app.backend.current()!;
    const setId = SET_ORDER.find((k) => SETS[k].items.includes(id));
    const set = setId ? SETS[setId] : null;
    const have = set ? set.items.filter((c) => state.collectibles[c]).length : 0;
    const done = set && have === set.items.length;
    return h(
      'div',
      { class: 'receipt-find' },
      thingThumb(id, 64),
      h(
        'div',
        null,
        h('div', { class: 'receipt-find-kicker' }, svgEl(icon('memento', 14)), 'Neu im Fundbuch'),
        h('b', null, COLLECTIBLES[id].name),
        h('small', null, COLLECTIBLES[id].desc),
        set
          ? h(
              'span',
              { class: 'receipt-set' + (done ? ' done' : '') },
              done ? `Set „${set.name}“ komplett! Bauplan ${blueprintName(set.blueprint)} und Rohstoffe liegen im Lager.` : `Set „${set.name}“: ${have} von ${set.items.length}`,
            )
          : null,
      ),
    );
  }

  private showReceipt(spot: Spot, ev: Extract<GameEvent, { type: 'loot' }>, note?: string) {
    this.mode = 'receipt';
    const { app } = this.ctx;
    const state = app.backend.current()!;
    if (!this.el) return;
    const memento = ev.memento ? MEMENTOS.find((m) => m.id === ev.memento) : undefined;
    const time = new Date(app.backend.now()).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const perkBg = BACKGROUND_NAME(state.character.background);
    const q = ev.quality;
    // Was diesmal mehr (oder weniger) gebracht hat, als kleine Marken
    const tags: [string, string][] = [];
    if (q === 'perfect') tags.push(['gold', `Perfekt +${Math.round((LOOT_QUALITY.perfect.factor - 1) * 100)} %`]);
    if (q === 'miss') tags.push(['dim', `Daneben −${Math.round((1 - LOOT_QUALITY.miss.factor) * 100)} %`]);
    if (ev.first) tags.push(['good', `Erstfund ×${FIRST_FIND_FACTOR}`]);
    if (ev.cart) tags.push(['gold', `Händlerkiste ×${CART.lootFactor}`]);
    if (ev.fed) tags.push(['good', `Satt +${Math.round(COOK.lootBonus * 100)} %`]);
    if (ev.night) tags.push(['night', 'Nacht +30 %']);
    if (ev.tier) tags.push(['gold', `${TIER.names[ev.tier]} +${Math.round((TIER.lootFactor[ev.tier] - 1) * 100)} %`]);
    if (ev.newKind) tags.push(['good', 'Neuer Ortstyp']);
    if (ev.bonus) tags.push(['good', 'Rückkehr ×2']);
    const items = h(
      'ul',
      { class: 'receipt-items' },
      RESOURCE_ORDER.filter((r) => ev.items[r]).map((r, i) =>
        h('li', { style: `--i:${i}`, 'data-rarity': RARITY[r], 'data-res': r }, svgEl(resIcon(r, 20), 'ri-icon'), h('span', { class: 'ri-name' }, RESOURCES[r].name), h('b', null, `+${ev.items[r]}`)),
      ),
    );
    const digBox = h('div', { class: 'dig-box' });
    clear(this.el);
    append(this.el, [
      h(
        'div',
        { class: 'receipt' + (ev.collectible ? ' epic' : '') },
        h('div', { class: 'receipt-head' }, h('span', null, 'Fundbeleg'), h('span', null, `Nr. ${String(state.stats.searches).padStart(4, '0')} · ${time}`)),
        ev.discovery ? h('div', { class: 'receipt-discovery' }, svgEl(icon('sparkle', 16)), 'Entdeckt! Ein besonderer Ort') : null,
        h('div', { class: 'receipt-place' }, spot.name),
        h('p', { class: 'receipt-story' }, spotStory(spot)),
        tags.length ? h('div', { class: 'receipt-tags' }, tags.map(([tone, t]) => h('span', { class: 'rtag', 'data-tone': tone }, t))) : null,
        ev.collectible ? this.collectibleNote(ev.collectible) : null,
        items,
        ev.perk ? h('p', { class: 'receipt-note' }, `${perkBg}: +1 ${RESOURCES[ev.perk].name} extra`) : null,
        note ? h('p', { class: 'receipt-note' }, note) : null,
        ev.kram
          ? h(
              'p',
              { class: 'receipt-blueprint junk' },
              thingThumb(ev.kram, 40),
              h('span', null, h('b', null, `Kram: ${KRAM[ev.kram].name}`), h('span', { class: 'junk-parts' }, 'Enthält ', partsChips(ev.kram))),
            )
          : null,
        state.stats.searches <= 4 && RESOURCE_ORDER.some((r) => ev.items[r] && isMaterial(r))
          ? h('p', { class: 'receipt-note' }, 'Rohstoffe und Kram kommen in den Rucksack. Zu Hause packst du aus.')
          : null,
        ev.blueprint ? h('p', { class: 'receipt-blueprint' }, svgEl(icon('blueprint', 18)), `Bauplan gefunden: ${blueprintName(ev.blueprint)}`) : null,
        ev.site ? h('p', { class: 'receipt-blueprint site' }, svgEl(icon('map', 18)), `Lageplan gefunden: ${SITES[ev.site].name}! Ein neuer Ort für dein Zuhause.`) : null,
        ev.clue ? this.clueNote(ev.clue) : null,
        digBox,
      ),
      memento
        ? h(
            'div',
            { class: 'memento-card' },
            h('div', { class: 'memento-kicker' }, svgEl(icon('memento', 16)), 'Erinnerungsstück gefunden'),
            h('div', { class: 'memento-title' }, memento.title),
            h('p', { class: 'memento-text' }, memento.text),
          )
        : null,
      h('button', { class: 'btn wide', type: 'button', onclick: () => this.pack(items) }, 'Einpacken'),
    ]);
    if (ev.canDig) this.renderDig(digBox, items);
  }

  /** Hinweis auf ein Versteck ansehen (vom Kreidezeichen auf der Karte). */
  showCache(c: Cache) {
    if (this.busy) return;
    this.openId = null;
    this.mode = 'receipt';
    if (!this.el) {
      this.el = h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Versteck' });
      this.ctx.host.append(this.el);
    }
    const fix = this.ctx.getFix();
    const toCircle = fix ? Math.max(0, distanceM(fix.pos, c.center) - (c.areaM ?? CACHE.areaM)) : null;
    const d = distanceM(c.fromPos, c.spot.pos);
    const dir = compassWord(bearingDeg(c.fromPos, c.spot.pos));
    clear(this.el);
    append(this.el, [
      h('button', { class: 'sheet-close iconbtn small', type: 'button', 'aria-label': 'Schließen', onclick: () => this.close() }, svgEl(icon('close', 18))),
      h(
        'div',
        { class: 'sheet-head' },
        h('span', { class: 'sheet-badge', 'data-cache': '1' }, svgEl(icon(c.via === 'radio' ? 'radioSet' : 'chalk', 26))),
        h(
          'div',
          null,
          h('div', { class: 'sheet-kicker' }, c.chain ? `Zettel-Kette · ${c.chain.step} von ${c.chain.of}` : 'Versteck'),
          h('h2', { class: 'sheet-title' }, c.via === 'radio' ? 'Hinweis per Funk' : c.via === 'tracks' ? 'Spuren auf dem Boden' : c.chain ? 'Ein Zettel mit Kreuzen' : 'Hinweis: ein Kreidezeichen'),
        ),
      ),
      c.via === 'tracks'
        ? h('p', { class: 'sheet-hint' }, `${TRACK_LINES[(hashString(c.id) >>> 0) % TRACK_LINES.length]} Folge der Spur auf der Karte, etwa ${Math.round(d / 50) * 50} m Richtung ${dir}.`)
        : h('p', { class: 'sheet-hint' }, `${c.via === 'radio' ? 'Auf Kanal 4' : `Bei „${c.fromName}“`}: etwa ${Math.round(d / 50) * 50} m Richtung ${dir}, bei: ${c.spot.name}.`),
      c.chain ? h('p', { class: 'sheet-hint small' }, c.chain.step < c.chain.of ? 'Im Versteck liegt bestimmt der nächste Zettel. Am Ende der Kette wartet etwas Besonderes.' : 'Das ist der letzte Zettel. Hier liegt der Schatz.') : null,
      h(
        'p',
        { class: 'sheet-hint' },
        toCircle === null ? 'Warte auf GPS …' : toCircle > 0 ? `Der Suchkreis ist ${formatDistance(toCircle)} entfernt. Darin zeigt dir „kalt, warm, heiß“ den Weg.` : 'Du bist im Suchkreis. Oben siehst du, ob es warm oder kalt ist. Bei „heiß“ antippen und ausgraben.',
      ),
      h('p', { class: 'sheet-hint small' }, 'Verstecke laufen nicht weg. Lass dir Zeit.'),
      this.ctx.isSim() && toCircle !== null && toCircle > 0
        ? h('button', { class: 'btn wide', type: 'button', onclick: () => (this.ctx.walkTo(c.center), this.close()) }, 'Hinlaufen')
        : h('button', { class: 'btn wide', type: 'button', onclick: () => this.close() }, 'OK'),
    ]);
  }

  /** Ausgegraben: was im Versteck lag. */
  showCacheFind(c: Cache, ev: Extract<GameEvent, { type: 'cacheOpened' }>) {
    this.openId = null;
    this.mode = 'receipt';
    if (!this.el) {
      this.el = h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Versteck' });
      this.ctx.host.append(this.el);
    }
    const items = h(
      'ul',
      { class: 'receipt-items' },
      RESOURCE_ORDER.filter((r) => ev.items[r]).map((r, i) =>
        h('li', { style: `--i:${i}`, 'data-rarity': RARITY[r], 'data-res': r }, svgEl(resIcon(r, 20), 'ri-icon'), h('span', { class: 'ri-name' }, RESOURCES[r].name), h('b', null, `+${ev.items[r]}`)),
      ),
    );
    clear(this.el);
    append(this.el, [
      h(
        'div',
        { class: 'receipt cache' + (ev.collectible ? ' epic' : '') },
        h('div', { class: 'receipt-head' }, h('span', null, ev.chainDone ? 'Ende der Kette!' : 'Versteck ausgegraben'), h('span', null, c.via === 'radio' ? 'Funk' : c.via === 'tracks' ? 'Spuren' : c.chain ? `Zettel ${c.chain.step}/${c.chain.of}` : 'Kreide')),
        h('div', { class: 'receipt-place' }, c.spot.name),
        ev.chainDone ? h('p', { class: 'receipt-story' }, `Der letzte Zettel hat sich gelohnt: ×${CHAIN.finalFactor} Beute und etwas fürs Fundbuch.`) : null,
        ev.next ? this.clueNote(ev.next) : null,
        ev.collectible ? this.collectibleNote(ev.collectible) : null,
        items,
        ev.kram
          ? h('p', { class: 'receipt-blueprint junk' }, thingThumb(ev.kram, 40), h('span', null, h('b', null, `Kram: ${KRAM[ev.kram].name}`), h('span', { class: 'junk-parts' }, 'Enthält ', partsChips(ev.kram))))
          : null,
        ev.blueprint ? h('p', { class: 'receipt-blueprint' }, svgEl(icon('blueprint', 18)), `Bauplan gefunden: ${blueprintName(ev.blueprint)}`) : null,
      ),
      h('button', { class: 'btn wide', type: 'button', onclick: () => this.pack(items) }, 'Einpacken'),
    ]);
  }

  /** Hinweis auf ein Versteck: grob die Richtung und wo. */
  private clueNote(id: string) {
    const c = this.ctx.app.backend.current()!.caches.find((x) => x.id === id);
    if (!c) return null;
    const d = distanceM(c.fromPos, c.spot.pos);
    const dir = compassWord(bearingDeg(c.fromPos, c.spot.pos));
    const where = `etwa ${Math.round(d / 50) * 50} m Richtung ${dir}`;
    const [title, text] =
      c.via === 'tracks'
        ? ['Spuren!', `${TRACK_LINES[(hashString(c.id) >>> 0) % TRACK_LINES.length]} Sie führen ${where}. Folge ihnen auf der Karte.`]
        : c.chain
          ? [`Zettel ${c.chain.step} von ${c.chain.of}`, `Eine Karte mit Kreuzen: ${where}, bei: ${c.spot.name}. Am Ende der Kette wartet etwas Besonderes.`]
          : ['Hinweis auf ein Versteck!', `Ein Kreidezeichen: ${where}, bei: ${c.spot.name}. Der Suchkreis ist auf der Karte markiert.`];
    return h('div', { class: 'receipt-clue' }, svgEl(icon(c.via === 'tracks' ? 'steps' : 'chalk', 22)), h('span', null, h('b', null, title), h('small', null, text)));
  }

  /** „Weiter wühlen“: kleine Extrafunde, aber jedes Mal lauter. */
  private renderDig(box: HTMLElement, items: HTMLElement) {
    const { app } = this.ctx;
    const s = app.backend.current()!;
    const d = s.dig;
    clear(box);
    if (!d || d.round >= DIG.max || d.until < app.backend.now()) return;
    const left = DIG.max - d.round;
    const meter = h('span', { class: 'noise' }, Array.from({ length: 5 }, (_, i) => h('i', { class: i < d.noise ? 'on' : '' })));
    const mood = d.noise === 0 ? 'Alles ruhig.' : d.noise === 1 ? 'Ein bisschen laut.' : d.noise === 2 ? 'Da hinten bewegt sich was …' : 'Gleich kommt was!';
    const btn = h('button', { class: 'btn small dig-btn', type: 'button' }, svgEl(icon('junk', 16)), `Weiter wühlen (${left})`);
    btn.addEventListener('click', async () => {
      const fix = this.ctx.getFix();
      if (!fix || this.busy) return;
      this.busy = true;
      btn.disabled = true;
      box.classList.add('digging');
      await sleep(reducedMotion() ? 100 : 550);
      const res = await app.backend.dispatch({ type: 'dig', at: fix.pos, accuracyM: fix.accuracyM });
      this.busy = false;
      box.classList.remove('digging');
      const ev = res.events[0];
      if (ev.type === 'ambush') {
        try {
          if (app.settings.get().vibration) navigator.vibrate?.([80, 40, 80]);
        } catch {
          /* egal */
        }
        app.toast('Zu laut! Da kommt was …', 'warn');
        this.ctx.onChanged();
        this.close();
        this.ctx.onAmbush();
        return;
      }
      if (ev.type === 'rejected') {
        app.toast(REJECT_TEXT[ev.reason], 'warn');
        clear(box);
        return;
      }
      if (ev.type === 'dug') {
        this.ctx.onChanged();
        addItems(items, ev.items);
        if (ev.kram) items.append(h('li', { class: 'new', 'data-rarity': 'uncommon' }, svgEl(icon('junk', 20), 'ri-icon'), h('span', { class: 'ri-name' }, `Kram: ${KRAM[ev.kram].name}`), h('b', null, '+1')));
        if (ev.collectible) items.append(h('li', { class: 'new', 'data-rarity': 'epic' }, svgEl(icon('memento', 20), 'ri-icon'), h('span', { class: 'ri-name' }, `Sammelstück: ${COLLECTIBLES[ev.collectible].name}`), h('b', null, '!')));
      }
      this.renderDig(box, items);
    });
    append(box, [h('div', { class: 'dig-row' }, btn, h('span', { class: 'dig-mood' }, meter, mood)), h('small', { class: 'dig-note' }, 'Findet noch Kleinkram. Macht aber Lärm, und Lärm lockt etwas an.')]);
  }

  /** Einpacken: die Funde fliegen in den Rucksack. */
  private pack(items: HTMLElement) {
    const target = this.ctx.flyTarget?.();
    if (target && !reducedMotion()) {
      const to = target.getBoundingClientRect();
      const icons = [...items.querySelectorAll('.ri-icon')].slice(0, 8) as HTMLElement[];
      icons.forEach((ic, i) => {
        const from = ic.getBoundingClientRect();
        const fly = ic.cloneNode(true) as HTMLElement;
        fly.className = 'fly-item';
        fly.style.left = `${from.left}px`;
        fly.style.top = `${from.top}px`;
        fly.style.setProperty('--dx', `${to.left + to.width / 2 - from.left - from.width / 2}px`);
        fly.style.setProperty('--dy', `${to.top + to.height / 2 - from.top - from.height / 2}px`);
        fly.style.animationDelay = `${i * 60}ms`;
        document.body.append(fly);
        setTimeout(() => fly.remove(), 900 + i * 60);
      });
      setTimeout(() => {
        target.classList.remove('bump');
        void (target as HTMLElement).offsetWidth;
        target.classList.add('bump');
      }, 650);
    }
    this.close();
  }
}

function BACKGROUND_NAME(id: keyof typeof BACKGROUNDS) {
  return BACKGROUNDS[id].name;
}

/** Neue Funde in die Liste schreiben (bestehende Zeilen hochzählen). */
function addItems(list: HTMLElement, add: Partial<Inventory>) {
  for (const r of RESOURCE_ORDER) {
    const n = add[r];
    if (!n) continue;
    const li = [...list.children].find((x) => (x as HTMLElement).dataset.res === r) as HTMLElement | undefined;
    if (li) {
      const b = li.querySelector('b')!;
      b.textContent = `+${Number(b.textContent?.replace('+', '') ?? 0) + n}`;
      li.classList.remove('new');
      void li.offsetWidth;
      li.classList.add('new');
    } else list.append(h('li', { class: 'new', 'data-rarity': RARITY[r], 'data-res': r }, svgEl(resIcon(r, 20), 'ri-icon'), h('span', { class: 'ri-name' }, RESOURCES[r].name), h('b', null, `+${n}`)));
  }
}
