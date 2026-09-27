// Små hjælpefunktioner til protokolregler.
// Ja/nej-spørgsmål besvares med 'ja', 'nej' eller 'ved_ikke'.

export const JA = 'ja';
export const NEJ = 'nej';
export const VED_IKKE = 'ved_ikke';

/** Sandt hvis spørgsmålet er besvaret med ja. */
export const ja = (a, id) => a[id] === JA;

/** Sandt hvis ja ELLER ved ikke – bruges til alarmsymptomer (forsigtighedsprincip). */
export const jaEllerUkendt = (a, id) => a[id] === JA || a[id] === VED_IKKE;

/** Talværdi eller undefined. Accepterer dansk decimalkomma. */
export function tal(a, id) {
  const v = a[id];
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Svar på valgspørgsmål. */
export const valg = (a, id) => a[id];

export const RISIKOFAKTORER = Object.freeze([
  { id: 'immunsupprimeret', tekst: 'Nedsat immunforsvar (fx prednisolon, biologisk behandling, transplanteret, miltløs)' },
  { id: 'kemoterapi', tekst: 'I kemoterapi eller anden kræftbehandling inden for 6 uger' },
  { id: 'hjertesygdom', tekst: 'Kendt hjertesygdom (iskæmisk hjertesygdom, hjertesvigt)' },
  { id: 'lungesygdom', tekst: 'Kronisk lungesygdom (KOL, svær astma)' },
  { id: 'diabetes', tekst: 'Diabetes' },
  { id: 'antikoagulans', tekst: 'Blodfortyndende behandling (AK-behandling, NOAK)' },
  { id: 'nyresygdom', tekst: 'Kronisk nyresygdom' },
  { id: 'skroebelig', tekst: 'Skrøbelig/plejekrævende (fx plejehjem, demens, multisyg)' },
]);

/** Patientkontekst med beregnede egenskaber. */
export function patientKontekst(p = {}) {
  const alder = Number.isFinite(p.alderAar) ? p.alderAar : undefined;
  const risiko = new Set(p.risiko ?? []);
  return {
    ...p,
    alderAar: alder,
    alderMdr: alder === undefined ? undefined : alder * 12,
    erBarn: alder !== undefined && alder < 16,
    erSpaed: alder !== undefined && alder < 0.25, // under 3 måneder
    erAeldre: alder !== undefined && alder >= 75,
    erKvinde: p.koen === 'kvinde',
    erMand: p.koen === 'mand',
    kanVaereGravid: p.koen !== 'mand' && alder !== undefined && alder >= 12 && alder <= 55,
    gravid: Boolean(p.gravid),
    gravidUge: Number.isFinite(p.gravidUge) ? p.gravidUge : undefined,
    risiko,
    har: (id) => risiko.has(id),
  };
}
