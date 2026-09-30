// THE ICONS: one line style, 24 x 24, stroke 1.8, round ends, no fill. The same paths as the
// Android app's design/icons (mantra_arkod), so both apps speak one language.

export const ICONS = {
  check: 'M5 12.5l4.5 4.5L19 7',
  chevron: 'M9 6l6 6-6 6',
  chevron_down: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12 M18 6L6 18',
  copy: 'M9 9h10v11H9z M5 15V4h10',
  edit: 'M4 20h4L18.5 9.5l-4-4L4 16z M13 7l4 4',
  eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  eye_off: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z M4 4l16 16',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  folder: 'M3 6h6l2 2h10v11H3z',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  google: 'M17.66 6.34A8 8 0 1 0 20 12H12.5',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 11v5 M12 8h0.01',
  key: 'M8 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M12 12h9 M18 12v3 M21 12v2',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  minus: 'M5 12h14',
  mountain: 'M3 19l6-10 4 6 3-4 5 8z',
  parcels: 'M4 4h16v16H4z M4 11h8 M12 4v16 M12 15h8',
  pin: 'M12 21s-6.5-5.8-6.5-11.2a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11.2-6.5 11.2z M12 7.8a2 2 0 1 0 0 4a2 2 0 1 0 0-4z',
  play: 'M7 5l12 7-12 7z',
  plus: 'M12 5v14 M5 12h14',
  save: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  search: 'M10.5 4.5a6 6 0 1 0 0 12a6 6 0 1 0 0-12z M15 15l5 5',
  settings: 'M18.82 10.43 L21.11 10.72 L21.11 13.28 L18.82 13.57 L17.94 15.71 L19.35 17.54 L17.54 19.35 L15.71 17.94 L13.57 18.82 L13.28 21.11 L10.72 21.11 L10.43 18.82 L8.29 17.94 L6.46 19.35 L4.65 17.54 L6.06 15.71 L5.18 13.57 L2.89 13.28 L2.89 10.72 L5.18 10.43 L6.06 8.29 L4.65 6.46 L6.46 4.65 L8.29 6.06 L10.43 5.18 L10.72 2.89 L13.28 2.89 L13.57 5.18 L15.71 6.06 L17.54 4.65 L19.35 6.46 L17.94 8.29z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  text: 'M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  share: 'M12 15V4 M7 9l5-5 5 5 M5 14v6h14v-6',
  fullscreen: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  fullscreen_exit: 'M9 4v5H4 M20 9h-5V4 M15 20v-5h5 M4 15h5v5',
  locate: 'M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4z M12 2v3 M12 19v3 M2 12h3 M19 12h3',
};

/** An icon as an inline SVG string, drawn in the text colour of where it sits. */
export function icon(name, size = 22) {
  const d = ICONS[name];
  if (!d) throw new Error(`no icon ${name}`);
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}
