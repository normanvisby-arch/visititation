// Genererer journalnotat for telefonvisitationen, jf. kravene i
// journalføringsbekendtgørelsen: tidspunkt, hvem der har haft kontakten,
// relevante oplysninger, vurdering, beslutning, information og råd givet.

import { SCREENING } from './screening.js';
import { MODIFIKATORER } from './engine.js';
import { RISIKOFAKTORER } from './helpers.js';

const SVARTEKST = { ja: 'Ja', nej: 'Nej', ved_ikke: 'Ved ikke' };

function formatTid(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} kl. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatSvar(q, v) {
  if (q.type === 'janej') return SVARTEKST[v] ?? v;
  if (q.type === 'valg') return q.valgmuligheder.find((o) => o.v === v)?.t ?? v;
  if (q.type === 'tal') return `${String(v).replace('.', ',')}${q.enhed ? ` ${q.enhed}` : ''}`;
  return String(v);
}

function formatAlder(aar) {
  if (aar === undefined) return 'alder ikke oplyst';
  if (aar < 2) return `${Math.round(aar * 12)} mdr.`;
  return `${Math.floor(aar)} år`;
}

/**
 * @param {object} resultat  output fra visiter()
 * @param {object} meta      { tidspunkt, visitator, rolle, indringer, kontaktaarsag, screening, modifikatorer, laegeKonsulteret, forstaaet, fritekst }
 */
export function lavJournalnotat(resultat, meta = {}) {
  const t = meta.tidspunkt ?? new Date();
  const p = resultat.patient;
  const linjer = [];

  linjer.push(`TELEFONVISITATION ${formatTid(t)}${meta.visitator ? ` v/ ${meta.visitator}` : ''}${meta.rolle ? ` (${meta.rolle})` : ''}`);
  linjer.push(`Indringer: ${meta.indringer || 'patienten selv'}`);
  const patientLinje = [formatAlder(p.alderAar), p.koen].filter(Boolean);
  if (p.gravid) patientLinje.push(`gravid${p.gravidUge ? ` uge ${p.gravidUge}` : ''}`);
  linjer.push(`Patient: ${patientLinje.join(', ')}`);
  const risici = RISIKOFAKTORER.filter((r) => p.har(r.id)).map((r) => r.tekst.split(' (')[0]);
  if (risici.length) linjer.push(`Risikofaktorer: ${risici.join('; ')}`);
  if (meta.kontaktaarsag) linjer.push(`Kontaktårsag (indringers ord): ${meta.kontaktaarsag}`);

  // Screening
  const scr = meta.screening ?? {};
  const positive = SCREENING.filter((q) => scr[q.id] === 'ja' || scr[q.id] === 'ved_ikke');
  if (positive.length === 0 && SCREENING.every((q) => scr[q.id] === 'nej')) {
    linjer.push('Screening for livstruende symptomer (ABCDE): Negativ.');
  } else {
    linjer.push('Screening for livstruende symptomer (ABCDE):');
    for (const q of positive) linjer.push(`  - ${q.begrundelse}: ${SVARTEKST[scr[q.id]]}`);
    const ubesvarede = SCREENING.filter((q) => !scr[q.id]);
    if (ubesvarede.length) linjer.push(`  - Ikke afklaret: ${ubesvarede.map((q) => q.begrundelse).join('; ')}`);
  }

  // Protokoller
  for (const r of resultat.protokolResultater) {
    linjer.push('');
    linjer.push(`${r.protokol.titel}:`);
    for (const q of r.synlige) {
      const v = r.svar[q.id];
      if (v === undefined) continue;
      linjer.push(`  - ${q.tekst.replace(/\?$/, '')}: ${formatSvar(q, v)}`);
    }
  }

  const mods = MODIFIKATORER.filter((m) => meta.modifikatorer?.[m.id]);
  if (mods.length) {
    linjer.push('');
    linjer.push(`Øvrigt: ${mods.map((m) => m.begrundelse).join('; ')}.`);
  }
  if (meta.fritekst) {
    linjer.push('');
    linjer.push(`Supplerende: ${meta.fritekst}`);
  }

  if (resultat.jev) {
    const j = resultat.jev.forslag;
    linjer.push('');
    linjer.push(
      `AI-beslutningsstøtte (Jev, ${j.model ?? 'ukendt model'}): hastegrad ${['hvid', 'blå', 'grøn', 'gul', 'orange', 'rød'][j.hastegrad?.niveau] ?? '?'} ` +
        `(sikkerhed ${Math.round((j.hastegrad?.sikkerhed ?? 0) * 100)} %), livstruende ${Math.round((j.livstruende ?? 0) * 100)} %. ` +
        'Forslaget er kun anvendt til at hæve hastegraden.',
    );
  }

  linjer.push('');
  linjer.push(`VURDERING: ${resultat.info.farve.toUpperCase()} – ${resultat.info.titel}.`);
  linjer.push(`Begrundelse: ${resultat.afgoerende.map((b) => b.tekst).join('; ')}.`);
  if (!resultat.komplet) linjer.push('OBS: Visitationen er ikke fuldt gennemført – ikke alle spørgsmål er besvaret.');
  linjer.push(`${resultat.aaben ? 'Inden for' : 'Uden for'} praksis' åbningstid.`);
  linjer.push('');
  linjer.push('PLAN:');
  for (const h of resultat.handlinger) linjer.push(`  - ${h}`);
  for (const r of resultat.ruter) linjer.push(`  - ${r}`);
  if (resultat.raad.length) {
    linjer.push('Råd givet:');
    for (const r of resultat.raad) linjer.push(`  - ${r}`);
  }
  if (resultat.sikkerhedsnet.length) {
    linjer.push('Sikkerhedsnet givet:');
    for (const s of resultat.sikkerhedsnet) linjer.push(`  - ${s}`);
  }
  linjer.push('');
  if (meta.forstaaet !== undefined) {
    linjer.push(`Indringer har forstået og accepteret planen: ${meta.forstaaet ? 'Ja' : 'Nej – lægen orienteret'}.`);
  }
  if (meta.laegeKonsulteret) {
    linjer.push(`Visitation drøftet med/godkendt af læge: ${meta.laegeKonsulteret}.`);
  } else if (resultat.kraeverLaege) {
    linjer.push('Lægen skal orienteres om/godkende visitationen.');
  }
  linjer.push('Visitation foretaget med beslutningsstøtteværktøj (Telefonvisitation).');
  return linjer.join('\n');
}
