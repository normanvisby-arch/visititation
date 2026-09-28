// Beslutningsmotor for telefonvisitation.
//
// Princip (forsigtighedsprincippet):
//  1. ABCDE-screening for livstruende symptomer stilles altid først.
//  2. For hver valgt symptomprotokol findes højeste udløste hastegrad;
//     protokollens standardniveau er altid bundniveau.
//  3. Modifikatorer (risikogruppe, gentagen henvendelse, bekymring,
//     visitators mavefornemmelse) kan kun hæve – aldrig sænke – hastegraden.
//  4. Den samlede hastegrad er den højeste af alle bidrag.

import { L, LEVELS, levelInfo } from './levels.js';
import { patientKontekst, RISIKOFAKTORER } from './helpers.js';
import { SCREENING, evaluerScreening } from './screening.js';
import { hentProtokol } from './protocols/index.js';
import { DEFAULT_CONFIG, erAaben, vagtNummer } from './config.js';

export const MODIFIKATORER = Object.freeze([
  {
    id: 'gentagetKontakt',
    tekst: 'Henvender sig igen om samme problem inden for 48 timer, eller tilstanden er forværret',
    minNiveau: L.SAMME_DAG,
    begrundelse: 'Gentagen henvendelse/forværring',
  },
  {
    id: 'bekymring',
    tekst: 'Patienten/pårørende er meget bekymret',
    minNiveau: L.SAMME_DAG,
    begrundelse: 'Udtalt bekymring hos patient/pårørende',
  },
  {
    id: 'kanIkkeVurderes',
    tekst: 'Tilstanden kan ikke vurderes sikkert pr. telefon (fx sprogbarriere, taler ikke med patienten selv, uklar sygehistorie)',
    minNiveau: L.SAMME_DAG,
    begrundelse: 'Kan ikke vurderes sikkert pr. telefon',
  },
  {
    id: 'mavefornemmelse',
    tekst: 'Visitator er usikker eller har en dårlig mavefornemmelse',
    minNiveau: L.SAMME_DAG,
    begrundelse: 'Visitators kliniske mavefornemmelse',
    kraeverLaege: true,
  },
]);

export const RUTER = Object.freeze({
  skadestue: (vagt) => `Skadestue/akutklinik – ring først til ${vagt} for visitation`,
  giftlinjen: () => 'Kontakt Giftlinjen 82 12 12 12 (døgnåben) for rådgivning om behandling',
  psykiatri: () => 'Psykiatrisk akutmodtagelse (døgnåben) – patienten bør ledsages',
  foedeafdeling: () => 'Ring direkte til fødeafdelingen (gravide efter ca. uge 18-20)',
  gynaekologi: (vagt) => `Akut gynækologisk vurdering – via egen læge eller ${vagt}`,
  oejenafdeling: (vagt) => `Akut øjenlæge/øjenafdeling – via egen læge eller ${vagt}`,
  onkologi: () => 'Ring til den behandlende kræftafdelings døgnåbne akuttelefon',
});

function erBesvaret(v) {
  return v !== undefined && v !== null && v !== '';
}

/** Evaluerer én symptomprotokol. */
export function evaluerProtokol(protokol, svar = {}, patient) {
  const p = patient?.har ? patient : patientKontekst(patient);
  const synlige = protokol.spoergsmaal.filter((q) => !q.visHvis || q.visHvis(svar, p));
  // Kun svar på synlige spørgsmål tæller – skjulte, forældede svar ignoreres.
  const aktive = {};
  for (const q of synlige) if (erBesvaret(svar[q.id])) aktive[q.id] = svar[q.id];

  const mangler = synlige
    .filter((q) => !q.valgfri && !erBesvaret(aktive[q.id]))
    .map((q) => ({ kilde: protokol.id, id: q.id, tekst: q.tekst }));

  const begrundelser = [];
  const ruter = new Set();
  for (const r of protokol.regler) {
    if (r.hvis(aktive, p)) {
      begrundelser.push({ niveau: r.niveau, tekst: r.tekst, kilde: protokol.titel });
      if (r.rute) ruter.add(r.rute);
    }
  }
  const std = typeof protokol.standard === 'function' ? protokol.standard(aktive, p) : protokol.standard;
  if (std) {
    begrundelser.push({ niveau: std.niveau, tekst: std.tekst, kilde: protokol.titel, standard: true });
    if (std.rute) ruter.add(std.rute);
  }
  const niveau = Math.max(L.EGENOMSORG, ...begrundelser.map((b) => b.niveau));
  const advarsler = [];
  if (protokol.gaelderFor && p.alderAar !== undefined && !protokol.gaelderFor(p)) {
    advarsler.push(`Protokollen "${protokol.titel}" er beregnet til: ${protokol.gaelderForTekst}.`);
  }
  return { protokol, niveau, begrundelser, mangler, ruter: [...ruter], synlige, advarsler, svar: aktive };
}

/**
 * Samlet visitation.
 * @param {object} input
 * @param {object} input.patient     { alderAar, koen, gravid, gravidUge, risiko: [] }
 * @param {object} input.screening   { [screeningId]: 'ja'|'nej'|'ved_ikke' }
 * @param {Array}  input.protokoller [{ id, svar }]
 * @param {object} input.modifikatorer { [modifikatorId]: boolean }
 * @param {Date}   input.tidspunkt
 * @param {object} input.config
 */
export function visiter({
  patient = {},
  screening = {},
  protokoller = [],
  modifikatorer = {},
  tidspunkt = new Date(),
  config = DEFAULT_CONFIG,
  jev,
} = {}) {
  const p = patientKontekst(patient);
  const begrundelser = [];
  const mangler = [];
  const ruter = new Set();
  const advarsler = [];
  let kraeverLaege = false;

  // 1. Screening
  const scr = evaluerScreening(screening);
  begrundelser.push(...scr.begrundelser);
  mangler.push(...scr.mangler);

  // 2. Protokoller
  const protokolResultater = protokoller.map(({ id, svar }) => {
    const prot = hentProtokol(id);
    const res = evaluerProtokol(prot, svar, p);
    begrundelser.push(...res.begrundelser);
    mangler.push(...res.mangler);
    res.ruter.forEach((r) => ruter.add(r));
    advarsler.push(...res.advarsler);
    if (prot.kraeverLaege) kraeverLaege = true;
    return res;
  });
  if (protokoller.length === 0) {
    mangler.push({ kilde: 'protokol', id: 'protokol', tekst: 'Vælg mindst én kontaktårsag/symptomprotokol' });
  }

  let niveau = Math.max(L.EGENOMSORG, ...begrundelser.map((b) => b.niveau));

  // 3a. Risikogrupper: hæv ét niveau (højst til samme dag) ved symptomhenvendelser.
  const kliniskeProtokoller = protokoller.filter((x) => x.id !== 'administrativt');
  if (kliniskeProtokoller.length > 0 && niveau < L.SAMME_DAG) {
    const risici = RISIKOFAKTORER.filter((r) => p.har(r.id)).map((r) => r.tekst.split(' (')[0]);
    if (p.gravid && !protokoller.some((x) => x.id === 'graviditet')) risici.push('Gravid');
    if ((p.alderAar ?? 0) >= 85 && !p.har('skroebelig')) risici.push('Alder ≥ 85 år');
    if (risici.length > 0) {
      const nyt = Math.min(niveau + 1, L.SAMME_DAG);
      begrundelser.push({ niveau: nyt, tekst: `Risikogruppe: ${risici.join(', ')} – hastegrad hævet ét niveau`, kilde: 'Modifikator' });
      niveau = nyt;
    }
    if (p.erSpaed) {
      begrundelser.push({ niveau: L.SAMME_DAG, tekst: 'Spædbarn under 3 måneder – skal altid vurderes af læge samme dag', kilde: 'Modifikator' });
      niveau = Math.max(niveau, L.SAMME_DAG);
    }
  }

  // 3b. Øvrige modifikatorer
  for (const m of MODIFIKATORER) {
    if (!modifikatorer[m.id]) continue;
    if (m.kraeverLaege) kraeverLaege = true;
    if (niveau < m.minNiveau) {
      begrundelser.push({ niveau: m.minNiveau, tekst: m.begrundelse, kilde: 'Modifikator' });
      niveau = m.minNiveau;
    } else {
      begrundelser.push({ niveau, tekst: `${m.begrundelse} (ændrer ikke hastegraden)`, kilde: 'Modifikator', info: true });
    }
  }

  // 3c. Jev (AI, System One) – kan kun hæve hastegraden eller kræve lægegodkendelse.
  const jevResultat = jev ? anvendJev(jev, niveau) : undefined;
  if (jevResultat) {
    begrundelser.push(...jevResultat.begrundelser);
    advarsler.push(...jevResultat.advarsler);
    niveau = jevResultat.niveau;
    if (jevResultat.kraeverLaege) kraeverLaege = true;
  }

  if (niveau >= L.AKUT) kraeverLaege = true;

  // 4. Disposition afhængig af åbningstid
  const aaben = erAaben(tidspunkt, config);
  const vagt = vagtNummer(config);
  const handlinger = dispositionFor(niveau, aaben, vagt);
  const ruteTekster = [...ruter].map((r) => (RUTER[r] ? RUTER[r](vagt) : r));

  const raad = [];
  const sikkerhedsnet = [];
  if (niveau < L.LIVSTRUENDE) {
    for (const r of protokolResultater) {
      raad.push(...(r.protokol.raad ?? []));
      sikkerhedsnet.push(...(r.protokol.sikkerhedsnet ?? []));
    }
    sikkerhedsnet.push(`Uden for praksis' åbningstid: kontakt ${vagt}. Ved livstruende symptomer: ring 112.`);
  }

  // Livstruende kan afsluttes straks, selvom ikke alle spørgsmål er besvaret.
  const komplet = mangler.length === 0 || niveau === L.LIVSTRUENDE;

  const sorteret = [...begrundelser].sort((a, b) => b.niveau - a.niveau || Number(Boolean(a.standard)) - Number(Boolean(b.standard)));

  return {
    niveau,
    info: levelInfo(niveau),
    begrundelser: sorteret,
    afgoerende: sorteret.filter((b) => b.niveau === niveau && !b.info),
    mangler,
    komplet,
    aaben,
    vagt,
    handlinger,
    ruter: ruteTekster,
    raad: [...new Set(raad)],
    sikkerhedsnet: [...new Set(sikkerhedsnet)],
    kraeverLaege,
    advarsler,
    jev: jevResultat,
    protokolResultater,
    patient: p,
  };
}

// Tærskler for Jev-svar (kalibrerede sandsynligheder 0-1).
export const JEV_TAERSKLER = Object.freeze({
  sikkerhed: 0.75, // under denne sikkerhed skal lægen godkende (eskalering til "System 2")
  livstruende: 0.5, // mulig livstruende tilstand → mindst orange + genafklar screening
  pAkut: 0.3, // sandsynlighed for mindst orange → mindst gul
  uklar: 0.5, // henvendelsen er uklar → lægen godkender
});

const pct = (x) => `${Math.round(x * 100)} %`;

/**
 * Indregner Jevs forslag efter forsigtighedsprincippet. Jev kan aldrig sænke den
 * regelbaserede hastegrad og kan aldrig selv udløse rød (112) – det kræver, at
 * visitator bekræfter et alarmsymptom i screeningen. Jev kan højst hæve til orange.
 */
export function anvendJev(jev, regelNiveau) {
  const T = JEV_TAERSKLER;
  const begrundelser = [];
  const advarsler = [];
  let niveau = regelNiveau;
  let kraeverLaege = false;
  const kilde = `Jev (${jev.model ?? 'AI'})`;
  const hast = jev.hastegrad ?? {};
  const loft = L.AKUT;

  const haev = (til, tekst) => {
    const nyt = Math.min(Math.max(niveau, til), loft);
    if (nyt > niveau) {
      begrundelser.push({ niveau: nyt, tekst, kilde });
      niveau = nyt;
      kraeverLaege = true;
    }
  };

  if ((jev.livstruende ?? 0) >= T.livstruende && regelNiveau < L.LIVSTRUENDE) {
    haev(L.AKUT, `Jev: mulig livstruende tilstand (${pct(jev.livstruende)}) – genafklar screeningen`);
    advarsler.push(`Jev vurderer ${pct(jev.livstruende)} sandsynlighed for livstruende tilstand. Gennemgå ABCDE-screeningen igen – ring 112 ved bekræftet alarmsymptom.`);
  }
  if (Number.isInteger(hast.niveau) && hast.niveau > regelNiveau) {
    haev(hast.niveau, `Jev vurderer højere hastegrad: ${LEVELS[Math.min(hast.niveau, L.LIVSTRUENDE)].farve.toLowerCase()} (sikkerhed ${pct(hast.sikkerhed ?? 0)})`);
  }
  if ((hast.pAkut ?? 0) >= T.pAkut) {
    haev(L.SAMME_DAG, `Jev: ${pct(hast.pAkut)} sandsynlighed for akut tilstand`);
  }
  for (const [id, p] of Object.entries(jev.screening ?? {})) {
    const navn = SCREENING.find((q) => q.id === id)?.begrundelse ?? id;
    if (p >= T.livstruende) advarsler.push(`Jev: henvendelsen nævner muligvis "${navn.toLowerCase()}" (${pct(p)}) – afklar screeningsspørgsmålet.`);
  }

  const usikker = (hast.sikkerhed ?? 1) < T.sikkerhed || (jev.protokolSikkerhed ?? 1) < T.sikkerhed;
  if (usikker || (jev.uklar ?? 0) >= T.uklar) {
    kraeverLaege = true;
    begrundelser.push({
      niveau,
      tekst: usikker ? 'Jev er usikker (< 75 %) – lægen skal godkende visitationen' : 'Jev: henvendelsen er uklar – lægen skal godkende visitationen',
      kilde,
      info: true,
    });
  }
  if (Number.isInteger(hast.niveau) && hast.niveau < regelNiveau) {
    begrundelser.push({ niveau: regelNiveau, tekst: 'Jev vurderer lavere hastegrad – den regelbaserede vurdering gælder', kilde, info: true });
  }
  return { niveau, begrundelser, advarsler, kraeverLaege, model: jev.model, forslag: jev };
}

export function dispositionFor(niveau, aaben, vagt) {
  switch (niveau) {
    case L.LIVSTRUENDE:
      return [
        'Ring 112 NU – eller bed indringer om straks at ringe 112.',
        'Bliv i røret, indtil 112 er kontaktet. Notér adresse og telefonnummer.',
        'Orientér lægen i praksis.',
      ];
    case L.AKUT:
      return aaben
        ? ['Afbryd lægen NU – lægen overtager/vurderer henvendelsen straks.', 'Patienten tilses eller vurderes af læge inden for 1 time eller henvises akut.']
        : [`Henvis straks til ${vagt}.`, 'Ved forværring: ring 112.'];
    case L.SAMME_DAG:
      return aaben
        ? ['Book tid eller lægelig telefonkonsultation i dag.']
        : [`Kontakt ${vagt} – bør vurderes af læge i dag.`];
    case L.FAA_DAGE:
      return aaben
        ? ['Book tid eller telefonkonsultation inden for 1-3 hverdage.']
        : ['Kontakt praksis førstkommende hverdag for tid inden for 1-3 hverdage.'];
    case L.PLANLAGT:
      return ['Tilbyd e-konsultation, telefontid eller almindelig tid inden for 1-2 uger.'];
    default:
      return ['Råd om egenomsorg – ingen tid nødvendig nu. Giv tydeligt sikkerhedsnet.'];
  }
}
