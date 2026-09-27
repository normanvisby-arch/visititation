// Praksisspecifik opsætning. Tilpas til egen praksis og region.
// Telefonnumre og åbningstider SKAL verificeres lokalt før brug.

export const REGIONER = Object.freeze({
  hovedstaden: { navn: 'Region Hovedstaden', vagt: 'Akuttelefonen 1813' },
  sjaelland: { navn: 'Region Sjælland', vagt: 'Akuttelefonen 1818' },
  syddanmark: { navn: 'Region Syddanmark', vagt: 'Lægevagten 70 11 07 07' },
  midtjylland: { navn: 'Region Midtjylland', vagt: 'Lægevagten 70 11 31 31' },
  nordjylland: { navn: 'Region Nordjylland', vagt: 'Lægevagten 70 15 03 00' },
});

export const DEFAULT_CONFIG = Object.freeze({
  praksisNavn: 'Lægepraksis',
  region: 'hovedstaden',
  // Ugedag: 0 = søndag ... 6 = lørdag. Tider i hele timer/minutter (lokal tid).
  aabningstider: {
    1: ['08:00', '16:00'],
    2: ['08:00', '16:00'],
    3: ['08:00', '16:00'],
    4: ['08:00', '16:00'],
    5: ['08:00', '15:00'],
  },
  // Helligdage (ÅÅÅÅ-MM-DD) hvor praksis er lukket.
  lukkedage: [],
  telefon: {
    alarm: '112',
    giftlinjen: 'Giftlinjen 82 12 12 12',
    livslinien: 'Livslinien 70 201 201',
  },
});

export function vagtNummer(config = DEFAULT_CONFIG) {
  return (REGIONER[config.region] ?? REGIONER.hovedstaden).vagt;
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Er praksis åben på det givne tidspunkt? */
export function erAaben(date = new Date(), config = DEFAULT_CONFIG) {
  if ((config.lukkedage ?? []).includes(isoDate(date))) return false;
  const tider = config.aabningstider?.[date.getDay()];
  if (!tider) return false;
  const nu = date.getHours() * 60 + date.getMinutes();
  return nu >= toMinutes(tider[0]) && nu < toMinutes(tider[1]);
}
