// Indledende ABCDE-screening. Stilles ALTID først, før symptomspecifikke spørgsmål.
// Et "ja" giver straks rød (112). "Ved ikke" kan ikke afkræfte livsfare og giver
// orange (lægen vurderer straks), jf. forsigtighedsprincippet.

import { L } from './levels.js';

export const SCREENING = Object.freeze([
  {
    id: 'bevidsthed',
    tekst: 'Er patienten bevidstløs, svær at vække eller reagerer ikke som normalt?',
    niveau: L.LIVSTRUENDE,
    begrundelse: 'Bevidsthedspåvirkning',
  },
  {
    id: 'vejrtraekning',
    tekst: 'Har patienten meget svært ved at trække vejret (kan ikke tale i hele sætninger, blålige læber, stønnende/snorkende vejrtrækning)?',
    niveau: L.LIVSTRUENDE,
    begrundelse: 'Svær vejrtrækningspåvirkning',
  },
  {
    id: 'brystsmerter',
    tekst: 'Har patienten NU trykkende eller kraftige brystsmerter, evt. med koldsved, kvalme eller udstråling til arm, hals eller kæbe?',
    niveau: L.LIVSTRUENDE,
    begrundelse: 'Mulig akut koronar hjertesygdom',
  },
  {
    id: 'bloedning',
    tekst: 'Er der kraftig blødning, som ikke kan standses?',
    niveau: L.LIVSTRUENDE,
    begrundelse: 'Ukontrollabel blødning',
  },
  {
    id: 'kramper',
    tekst: 'Har patienten kramper nu, eller har krampeanfaldet varet mere end 5 minutter?',
    niveau: L.LIVSTRUENDE,
    begrundelse: 'Igangværende eller langvarige kramper',
  },
  {
    id: 'apopleksi',
    tekst: 'Er der opstået pludselig skæv mund, lammelse/kraftnedsættelse i arm eller ben, eller talebesvær, som er til stede nu?',
    niveau: L.LIVSTRUENDE,
    begrundelse: 'Mulig apopleksi (blodprop/blødning i hjernen)',
  },
  {
    id: 'anafylaksi',
    tekst: 'Er der tegn på svær allergisk reaktion: hævelse af ansigt, læber eller svælg med vejrtræknings- eller synkebesvær, eller svimmelhed/besvimelse?',
    niveau: L.LIVSTRUENDE,
    begrundelse: 'Mulig anafylaksi',
  },
  {
    id: 'petekkier',
    tekst: 'Har patienten feber eller er utilpas OG udslæt med små røde/lilla prikker, der ikke forsvinder ved tryk med et glas?',
    niveau: L.LIVSTRUENDE,
    begrundelse: 'Mulig meningokoksygdom (blodforgiftning)',
  },
  {
    id: 'livsfare',
    tekst: 'Har patienten forsøgt selvmord, eller er der umiddelbar fare for patientens eller andres liv?',
    niveau: L.LIVSTRUENDE,
    begrundelse: 'Umiddelbar livsfare / selvmordsforsøg',
  },
  {
    id: 'almenpaavirket',
    tekst: 'Virker patienten meget syg – grå/bleg, klam, slap, forvirret eller markant anderledes end vanligt?',
    niveau: L.AKUT,
    begrundelse: 'Almen svær påvirkning',
  },
]);

/** Evaluerer screeningen. Returnerer begrundelser og manglende svar. */
export function evaluerScreening(svar = {}) {
  const begrundelser = [];
  const mangler = [];
  for (const q of SCREENING) {
    const s = svar[q.id];
    if (s === 'ja') {
      begrundelser.push({ niveau: q.niveau, tekst: q.begrundelse, kilde: 'Screening' });
    } else if (s === 'ved_ikke') {
      begrundelser.push({
        niveau: Math.min(q.niveau, L.AKUT),
        tekst: `${q.begrundelse} kan ikke afkræftes`,
        kilde: 'Screening',
      });
    } else if (s !== 'nej') {
      mangler.push({ kilde: 'screening', id: q.id, tekst: q.tekst });
    }
  }
  return { begrundelser, mangler };
}
