// THE CONTROLS, one kind each (MANTRA_MANIFEST language-trail.md §2): Action (the one solid amber
// thing a panel is for), quiet Action, Toggle, Choice (the chosen part raised, never amber), Opens,
// Pick, Icon action. Built with plain DOM; nothing else draws a control.

import { icon } from './icons.js';

/** h('div.card', {onclick}, children...) */
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ic = (name, size) => { const s = document.createElement('span'); s.className = 'icw'; s.innerHTML = icon(name, size); return s; };
export { ic as iconEl };

export function action(verb, iconName, onclick, { quiet = false, danger = false, disabled = false, trailing = null, id = null } = {}) {
  return h(`button.act${quiet ? '.quiet' : ''}${danger ? '.danger' : ''}`, { onclick, disabled, id, type: 'button' },
    iconName ? ic(iconName, 20) : null, h('span.verb', {}, verb), trailing ? h('span.trail', {}, trailing) : null);
}

export function toggle(word, iconName, on, onchange, { id = null } = {}) {
  const row = h('button.row.toggle', { type: 'button', role: 'switch', 'aria-checked': String(!!on), id },
    iconName ? ic(iconName) : null, h('span.title', {}, word), h('span.switch' + (on ? '.on' : '')));
  row.addEventListener('click', () => onchange(!(row.getAttribute('aria-checked') === 'true')));
  return row;
}

/** One bar split into parts; the chosen part raised and bright, the rest dim. Never amber. */
export function choice(parts, chosen, onchoose, { swatches = false, id = null } = {}) {
  return h('div.choice' + (swatches ? '.swatches' : ''), { role: 'radiogroup', id },
    parts.map((p, i) => {
      const b = h('button.part' + (i === chosen ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(i === chosen), onclick: () => onchoose(i), title: p.title ?? p.word ?? '' },
        p.icon ? ic(p.icon, 18) : null, p.word ? h('span', {}, p.word) : null);
      if (p.colour) { b.style.background = p.colour; b.classList.add('sw'); if (i === chosen) b.append(ic('check', 16)); }
      return b;
    }));
}

export function opens(title, iconName, under, onclick, { id = null } = {}) {
  return h('button.row.opens', { type: 'button', onclick, id },
    iconName ? ic(iconName) : null,
    h('span.col', {}, h('span.title', {}, title), under != null ? h('span.under', {}, under) : null),
    ic('chevron', 18));
}

export function pick(title, iconName, chosen, under, onclick) {
  return h('button.row.pick', { type: 'button', onclick },
    iconName ? ic(iconName) : null,
    h('span.col', {}, h('span.title', {}, title), under ? h('span.under', {}, under) : null),
    chosen ? ic('check', 18) : null);
}

export function iconAction(iconName, name, onclick, { danger = false, id = null, title = null } = {}) {
  return h('button.iact' + (danger ? '.danger' : ''), { type: 'button', onclick, id, title: title ?? name ?? iconName, 'aria-label': title ?? name ?? iconName },
    ic(iconName, 22), name ? h('span.nm', {}, name) : null);
}

export function group(title, ...rows) {
  return h('section.group', {}, h('h3', {}, title), h('div.card', {}, rows));
}

/** A face that covers the screen: title row with icon, title and ✕, then the body. */
export function face(iconName, title, onclose, body, { id = null, extra = null } = {}) {
  return h('div.face', { id, role: 'dialog', 'aria-label': title },
    h('header.facehead', {}, ic(iconName), h('h2', {}, title), extra, iconAction('close', null, onclose, { title: 'Close', id: id ? id + '-close' : null })),
    h('div.facebody', {}, body));
}

/** Google Maps' list shape: a pin with the distance, the name, the line under it. */
export function results(hits, onpick, distanceLabel) {
  return h('div.results', {}, hits.map((x) => h('button.hit', { type: 'button', onclick: () => onpick(x) },
    h('span.hpin', {}, ic('pin', 20), h('small', {}, distanceLabel(x.distanceM))),
    h('span.col', {}, h('span.title', {}, x.title), x.under ? h('span.under', {}, x.under) : null))));
}

/** A search box that offers its own history when it is touched (v8, every search box). */
export function searchBox({ placeholder, history, oninput, onsubmit, onpickPast, id, value = '' }) {
  const input = h('input.field', { type: 'search', placeholder, id, value, autocomplete: 'off', enterkeyhint: 'search' });
  const past = h('div.past');
  const wrap = h('div.searchbox', {}, h('span.sico', {}, ic('search', 20)), input, past);
  const showPast = () => {
    past.replaceChildren();
    if (input.value.trim() !== '') return;
    const list = history();
    list.slice(0, 8).forEach((t) => past.append(h('button.pastrow', { type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => { input.value = t; past.replaceChildren(); onpickPast(t); } }, ic('search', 16), h('span', {}, t))));
  };
  input.addEventListener('focus', showPast);
  input.addEventListener('blur', () => setTimeout(() => past.replaceChildren(), 150));
  input.addEventListener('input', () => { showPast(); oninput?.(input.value); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); past.replaceChildren(); onsubmit?.(input.value); } });
  return { wrap, input };
}

/** Ask for a name: the box, OK and Odbaci, and it waits. */
export function nameBox(title, current, onok) {
  return new Promise((resolve) => {
    const input = h('input.field', { value: current ?? '', 'aria-label': title });
    const veil = h('div.veil', {},
      h('div.box', {}, h('div.dim', {}, title), input,
        h('div.two', {},
          action('Odbaci', 'close', () => { veil.remove(); resolve(null); }, { quiet: true }),
          action('OK', 'check', () => { const v = input.value.trim(); veil.remove(); resolve(v || null); onok?.(v); }))));
    document.body.append(veil);
    input.focus();
    input.select();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') veil.querySelector('.act:not(.quiet)').click(); });
  });
}
