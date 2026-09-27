import { brystsmerter, aandenoed, hjertebanken, benhaevelse } from './hjerte-lunge.js';
import { feberVoksen, feberBarn, luftveje, halsondt, oerepine } from './infektion.js';
import { mavesmerter, diarreOpkast, urinveje } from './mave-urin.js';
import { hovedpine, neurologi, svimmelhed, psykisk } from './neuro-psyk.js';
import { skade, hud, allergi, oejne } from './skade-hud.js';
import { graviditet, rygsmerter, diabetes, forgiftning, administrativt, andet } from './oevrige.js';

export const PROTOKOLLER = Object.freeze([
  brystsmerter,
  aandenoed,
  hjertebanken,
  benhaevelse,
  feberVoksen,
  feberBarn,
  luftveje,
  halsondt,
  oerepine,
  mavesmerter,
  diarreOpkast,
  urinveje,
  hovedpine,
  neurologi,
  svimmelhed,
  psykisk,
  skade,
  hud,
  allergi,
  oejne,
  graviditet,
  rygsmerter,
  diabetes,
  forgiftning,
  administrativt,
  andet,
]);

const INDEX = new Map(PROTOKOLLER.map((p) => [p.id, p]));

export function hentProtokol(id) {
  const p = INDEX.get(id);
  if (!p) throw new Error(`Ukendt protokol: ${id}`);
  return p;
}

/** Protokoller der passer til patienten, evt. filtreret på søgetekst. */
export function soegProtokoller(tekst = '', patient) {
  const q = tekst.trim().toLowerCase();
  return PROTOKOLLER.filter((p) => {
    if (patient && p.gaelderFor && !p.gaelderFor(patient)) return false;
    if (!q) return true;
    return p.titel.toLowerCase().includes(q) || p.soegeord.some((s) => s.includes(q) || q.includes(s));
  });
}
