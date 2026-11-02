// Icône d'onglet : une petite maison dont la cheminée fume. Les navigateurs n'animent pas les icônes SVG,
// alors on change d'image quelques fois par seconde.

const FRAMES = 12;
const FRAME_MS = 160;

const house = `
  <rect x="21" y="10" width="3.5" height="6" rx="0.5" fill="#7a4e33"/>
  <rect x="6" y="18" width="20" height="12" rx="1" fill="#f3e3c3"/>
  <polygon points="2.5,19.5 16,8 29.5,19.5" fill="#c0573e"/>
  <rect x="14" y="23" width="5" height="7" rx="1" fill="#6b4a2f"/>
  <rect x="8.5" y="21.5" width="4" height="4" rx="0.5" fill="#ffcf5a"/>`;

/** Trois bouffées de fumée qui montent en grossissant et s'effacent ; `t` va de 0 à 1. */
function smoke(t: number) {
  return [0, 1, 2]
    .map((i) => {
      const p = (t + i / 3) % 1;
      const fade = Math.min(1, p * 6) * (1 - p);
      const cx = 22.75 + p * 3 + Math.sin(p * Math.PI * 2) * 0.8;
      return `<circle cx="${cx.toFixed(2)}" cy="${(9 - p * 9).toFixed(2)}" r="${(1.3 + p * 2.3).toFixed(2)}" fill="#a9b3ba" opacity="${(fade * 0.95).toFixed(2)}"/>`;
    })
    .join('');
}

const frame = (t: number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${smoke(t)}${house}</svg>`)}`;

export function animateFavicon() {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.head.appendChild(document.createElement('link'));
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  const frames = Array.from({ length: FRAMES }, (_, i) => frame(i / FRAMES));
  link.href = frames[0];
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let i = 0;
  setInterval(() => {
    i = (i + 1) % FRAMES;
    link.href = frames[i];
  }, FRAME_MS);
}
