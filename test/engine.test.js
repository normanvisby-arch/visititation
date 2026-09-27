import { test } from 'node:test';
import assert from 'node:assert/strict';
import { visiter, evaluerProtokol } from '../src/engine.js';
import { L } from '../src/levels.js';
import { SCREENING } from '../src/screening.js';
import { PROTOKOLLER, hentProtokol, soegProtokoller } from '../src/protocols/index.js';
import { patientKontekst } from '../src/helpers.js';
import { erAaben } from '../src/config.js';
import { lavJournalnotat } from '../src/journal.js';

const HVERDAG = new Date(2026, 8, 29, 10, 0); // tirsdag kl. 10
const NAT = new Date(2026, 8, 29, 23, 0);
const alleNej = Object.fromEntries(SCREENING.map((q) => [q.id, 'nej']));

function allNej(protokolId, patient, overrides = {}) {
  const prot = hentProtokol(protokolId);
  const p = patientKontekst(patient);
  const svar = {};
  // Besvar iterativt, så betingede spørgsmål også får svar.
  for (let i = 0; i < 3; i++) {
    for (const q of prot.spoergsmaal) {
      if (q.visHvis && !q.visHvis({ ...svar, ...overrides }, p)) continue;
      if (svar[q.id] !== undefined) continue;
      if (q.type === 'janej') svar[q.id] = 'nej';
      else if (q.type === 'tal') svar[q.id] = q.valgfri ? undefined : q.min;
      else if (q.type === 'valg') svar[q.id] = q.valgmuligheder.at(-1).v;
    }
  }
  return { ...svar, ...overrides };
}

function kør(protokolId, patient, overrides, extra = {}) {
  return visiter({
    patient,
    screening: alleNej,
    protokoller: [{ id: protokolId, svar: allNej(protokolId, patient, overrides) }],
    tidspunkt: HVERDAG,
    ...extra,
  });
}

const voksen = { alderAar: 45, koen: 'mand' };
const kvinde = { alderAar: 30, koen: 'kvinde' };
const barn = { alderAar: 3, koen: 'kvinde' };

test('alle protokoller har gyldig struktur', () => {
  const ids = new Set();
  for (const p of PROTOKOLLER) {
    assert.ok(!ids.has(p.id), `dublet ${p.id}`);
    ids.add(p.id);
    assert.ok(p.titel && p.gruppe && Array.isArray(p.soegeord));
    const qids = new Set();
    for (const q of p.spoergsmaal) {
      assert.ok(!qids.has(q.id), `dublet spørgsmål ${p.id}.${q.id}`);
      qids.add(q.id);
      assert.ok(['janej', 'tal', 'valg'].includes(q.type), `${p.id}.${q.id}`);
      assert.match(q.id, /^[a-z0-9_]+$/, `ASCII-id påkrævet: ${p.id}.${q.id}`);
    }
    for (const r of p.regler) {
      assert.ok(r.niveau >= L.EGENOMSORG && r.niveau <= L.LIVSTRUENDE);
      assert.equal(typeof r.hvis, 'function');
      assert.ok(r.tekst);
    }
  }
});

test('ingen protokol fejler på tomme svar eller alle "ved ikke"', () => {
  for (const prot of PROTOKOLLER) {
    for (const patient of [voksen, kvinde, barn, { alderAar: 0.1 }, {}]) {
      evaluerProtokol(prot, {}, patient);
      const vedIkke = Object.fromEntries(prot.spoergsmaal.map((q) => [q.id, q.type === 'janej' ? 'ved_ikke' : undefined]));
      evaluerProtokol(prot, vedIkke, patient);
    }
  }
});

test('alle protokoller giver et komplet resultat, når alt er besvaret nej', () => {
  for (const prot of PROTOKOLLER) {
    const patient = prot.id === 'feber_barn' ? barn : prot.id === 'graviditet' ? { ...kvinde, gravid: true } : voksen;
    const r = kør(prot.id, patient, {});
    assert.equal(r.komplet, true, `${prot.id}: ${JSON.stringify(r.mangler)}`);
    assert.ok(r.niveau <= L.SAMME_DAG, `${prot.id} gav ${r.niveau} uden alarmsymptomer`);
  }
});

test('screening: ja giver rød, ved ikke giver orange, manglende svar = ikke komplet', () => {
  for (const q of SCREENING) {
    const r = visiter({ screening: { ...alleNej, [q.id]: 'ja' }, protokoller: [], tidspunkt: HVERDAG });
    assert.equal(r.niveau, q.niveau, q.id);
    const u = visiter({ screening: { ...alleNej, [q.id]: 'ved_ikke' }, protokoller: [], tidspunkt: HVERDAG });
    assert.equal(u.niveau, Math.min(q.niveau, L.AKUT), q.id);
  }
  const r = visiter({ screening: { ...alleNej, bevidsthed: 'ja' }, tidspunkt: HVERDAG });
  assert.equal(r.komplet, true, 'livstruende kan afsluttes straks');
  assert.match(r.handlinger[0], /112/);
  const tom = visiter({ screening: {}, protokoller: [{ id: 'luftveje', svar: {} }] });
  assert.equal(tom.komplet, false);
});

test('brystsmerter: aktuelle trykkende smerter = 112', () => {
  const r = kør('brystsmerter', voksen, { smerter_nu: 'ja', trykkende: 'ja' });
  assert.equal(r.niveau, L.LIVSTRUENDE);
});

test('brystsmerter: trykkende inden for 12 timer men ikke nu = akut', () => {
  const r = kør('brystsmerter', voksen, { trykkende: 'ja', debut: 'under_12t' });
  assert.equal(r.niveau, L.AKUT);
});

test('brystsmerter: ung med muskuloskeletale smerter = få dage', () => {
  const r = kør('brystsmerter', { alderAar: 25, koen: 'mand' }, { muskulaer: 'ja' });
  assert.equal(r.niveau, L.FAA_DAGE);
  const aeldre = kør('brystsmerter', { alderAar: 60, koen: 'mand' }, { muskulaer: 'ja' });
  assert.equal(aeldre.niveau, L.SAMME_DAG);
});

test('åndenød: kan ikke tale i hele sætninger = 112; saturation', () => {
  assert.equal(kør('aandenoed', voksen, { tale: 'ja' }).niveau, L.LIVSTRUENDE);
  assert.equal(kør('aandenoed', voksen, { tale: 'nej', saturation: 88 }).niveau, L.LIVSTRUENDE);
  assert.equal(kør('aandenoed', voksen, { tale: 'nej', saturation: '93' }).niveau, L.AKUT);
  assert.equal(kør('aandenoed', voksen, { tale: 'nej', saturation: 97 }).niveau, L.SAMME_DAG);
});

test('feber barn: spædbarn under 3 mdr = akut', () => {
  const r = kør('feber_barn', { alderAar: 1 / 12 }, { temp: 38.2 });
  assert.equal(r.niveau, L.AKUT);
});

test('feber barn: slapt barn = 112, tørre bleer = akut, ukompliceret = egenomsorg', () => {
  assert.equal(kør('feber_barn', barn, { slap: 'ja' }).niveau, L.LIVSTRUENDE);
  assert.equal(kør('feber_barn', barn, { toerre_bleer: 'ja' }).niveau, L.AKUT);
  assert.equal(kør('feber_barn', barn, { temp: 38.9, dage: 1 }).niveau, L.EGENOMSORG);
  assert.equal(kør('feber_barn', barn, { dage: 3 }).niveau, L.SAMME_DAG);
});

test('feber voksen: kemoterapi = akut med onkologi-rute', () => {
  const r = kør('feber_voksen', { ...voksen, risiko: ['kemoterapi'] }, { temp: 38.3, dage: 1 });
  assert.equal(r.niveau, L.AKUT);
  assert.ok(r.ruter.some((t) => /kræftafdeling/.test(t)));
});

test('mavesmerter: mulig graviditet = akut; testikelsmerter = akut', () => {
  assert.equal(kør('mavesmerter', kvinde, { graviditet: 'ja' }).niveau, L.AKUT);
  assert.equal(kør('mavesmerter', { alderAar: 14, koen: 'mand' }, { testikel: 'ja' }).niveau, L.AKUT);
});

test('mavesmerter: graviditetsspørgsmål vises ikke for mænd', () => {
  const r = evaluerProtokol(hentProtokol('mavesmerter'), {}, { alderAar: 30, koen: 'mand' });
  assert.ok(!r.synlige.some((q) => q.id === 'graviditet'));
});

test('neurologi: symptomer nu = 112, TIA inden for en uge = akut', () => {
  assert.equal(kør('neurologi', voksen, { nu: 'ja' }).niveau, L.LIVSTRUENDE);
  assert.equal(kør('neurologi', voksen, { nu: 'nej', hvornaar: 'under_7d' }).niveau, L.AKUT);
});

test('psykisk: selvmordsplan = akut med psykiatri-rute', () => {
  const r = kør('psykisk', voksen, { plan: 'ja' });
  assert.equal(r.niveau, L.AKUT);
  assert.ok(r.ruter.some((t) => /Psykiatrisk/.test(t)));
});

test('graviditet: nedsatte fosterbevægelser efter uge 22 = akut, fødeafdeling', () => {
  const r = kør('graviditet', { ...kvinde, gravid: true }, { uge: 32, fosterbevaegelser: 'ja' });
  assert.equal(r.niveau, L.AKUT);
  assert.ok(r.ruter.some((t) => /fødeafdeling/.test(t)));
});

test('graviditet: fosterbevægelse-svar ignoreres før uge 22 (skjult spørgsmål)', () => {
  const r = kør('graviditet', { ...kvinde, gravid: true }, { uge: 10, fosterbevaegelser: 'ja' });
  assert.ok(r.niveau < L.AKUT);
});

test('allergi: adrenalin givet = 112', () => {
  assert.equal(kør('allergi', voksen, { adrenalin: 'ja' }).niveau, L.LIVSTRUENDE);
});

test('risikogruppe hæver ét niveau, men aldrig over samme dag', () => {
  const normal = kør('luftveje', voksen, {});
  const risiko = kør('luftveje', { ...voksen, risiko: ['lungesygdom'] }, {});
  assert.equal(normal.niveau, L.EGENOMSORG);
  assert.equal(risiko.niveau, L.PLANLAGT);
  const fd = kør('urinveje', { ...voksen, risiko: ['immunsupprimeret'] }, {});
  assert.equal(fd.niveau, L.SAMME_DAG);
});

test('administrative henvendelser hæves ikke af risikogruppe', () => {
  const r = kør('administrativt', { ...voksen, risiko: ['diabetes'] }, {});
  assert.equal(r.niveau, L.PLANLAGT);
});

test('modifikatorer kan kun hæve, aldrig sænke', () => {
  const r = kør('luftveje', voksen, {}, { modifikatorer: { bekymring: true } });
  assert.equal(r.niveau, L.SAMME_DAG);
  const hoej = kør('brystsmerter', voksen, { smerter_nu: 'ja', trykkende: 'ja' }, { modifikatorer: { bekymring: true } });
  assert.equal(hoej.niveau, L.LIVSTRUENDE);
  const mave = kør('luftveje', voksen, {}, { modifikatorer: { mavefornemmelse: true } });
  assert.equal(mave.kraeverLaege, true);
});

test('flere protokoller: højeste niveau vinder', () => {
  const r = visiter({
    patient: voksen,
    screening: alleNej,
    protokoller: [
      { id: 'luftveje', svar: allNej('luftveje', voksen) },
      { id: 'hovedpine', svar: allNej('hovedpine', voksen, { feber_nakke: 'ja' }) },
    ],
    tidspunkt: HVERDAG,
  });
  assert.equal(r.niveau, L.AKUT);
});

test('disposition afhænger af åbningstid', () => {
  const dag = kør('feber_voksen', voksen, { dage: 5 });
  const nat = kør('feber_voksen', voksen, { dage: 5 }, { tidspunkt: NAT });
  assert.equal(dag.niveau, L.SAMME_DAG);
  assert.match(dag.handlinger[0], /i dag/);
  assert.match(nat.handlinger[0], /1813/);
});

test('åbningstider', () => {
  assert.equal(erAaben(new Date(2026, 8, 29, 10, 0)), true);
  assert.equal(erAaben(new Date(2026, 8, 29, 7, 59)), false);
  assert.equal(erAaben(new Date(2026, 8, 29, 16, 0)), false);
  assert.equal(erAaben(new Date(2026, 8, 27, 10, 0)), false, 'søndag');
});

test('protokolsøgning filtrerer på alder', () => {
  const b = soegProtokoller('feber', patientKontekst(barn)).map((p) => p.id);
  assert.ok(b.includes('feber_barn') && !b.includes('feber_voksen'));
  const v = soegProtokoller('feber', patientKontekst(voksen)).map((p) => p.id);
  assert.ok(v.includes('feber_voksen') && !v.includes('feber_barn'));
});

test('journalnotat indeholder vurdering, begrundelse og sikkerhedsnet', () => {
  const svar = allNej('feber_barn', barn, { temp: 39.1, dage: 1 });
  const r = visiter({ patient: barn, screening: alleNej, protokoller: [{ id: 'feber_barn', svar }], tidspunkt: HVERDAG });
  const note = lavJournalnotat(r, { tidspunkt: HVERDAG, visitator: 'AB', rolle: 'sekretær', indringer: 'mor', screening: alleNej, forstaaet: true });
  assert.match(note, /TELEFONVISITATION 29\.09\.2026 kl\. 10:00 v\/ AB/);
  assert.match(note, /Screening .*Negativ/);
  assert.match(note, /VURDERING: HVID – Egenomsorg/);
  assert.match(note, /39,1 °C/);
  assert.match(note, /Sikkerhedsnet givet/);
});
