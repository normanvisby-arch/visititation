import { visiter, MODIFIKATORER } from '../src/engine.js';
import { SCREENING } from '../src/screening.js';
import { PROTOKOLLER, hentProtokol, soegProtokoller } from '../src/protocols/index.js';
import { RISIKOFAKTORER, patientKontekst } from '../src/helpers.js';
import { DEFAULT_CONFIG, REGIONER } from '../src/config.js';
import { lavJournalnotat } from '../src/journal.js';
import { L, LEVELS } from '../src/levels.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Kun ikke-personhenførbare indstillinger gemmes lokalt (region).
function hentRegion() {
  try {
    return localStorage.getItem('tv.region') || DEFAULT_CONFIG.region;
  } catch {
    return DEFAULT_CONFIG.region;
  }
}
function gemRegion(r) {
  try {
    localStorage.setItem('tv.region', r);
  } catch {
    /* ignoreres */
  }
}

let state;
function nyState() {
  return {
    screening: {},
    valgte: [], // protokol-id'er
    svar: {}, // { protokolId: { spørgsmålId: værdi } }
    modifikatorer: {},
    risiko: new Set(),
    soeg: '',
    startet: new Date(),
    jev: undefined, // seneste Jev-forslag
    jevTekst: '', // teksten Jev analyserede
    jevFejl: '',
  };
}

const config = () => ({ ...DEFAULT_CONFIG, region: $('#region').value });

function patientInput() {
  const aar = $('#alderAar').value;
  const mdr = $('#alderMdr').value;
  let alderAar;
  if (aar !== '' || mdr !== '') alderAar = Number(aar || 0) + Number(mdr || 0) / 12;
  const koen = document.querySelector('input[name="koen"]:checked')?.value;
  const gravidUge = $('#gravidUge').value === '' ? undefined : Number($('#gravidUge').value);
  return {
    alderAar,
    koen,
    gravid: !$('#gravid-wrap').hidden && $('#gravid').checked,
    gravidUge,
    risiko: [...state.risiko],
  };
}

// ---------- Rendering af spørgsmål ----------

function janejHtml(name, value, tekst, extraClass = '', attrs = '') {
  const opts = [
    ['ja', 'Ja'],
    ['nej', 'Nej'],
    ['ved_ikke', 'Ved ikke'],
  ];
  return `
    <div class="q ${extraClass}" ${attrs}>
      <div class="q-text">${esc(tekst)}</div>
      <div class="q-opts" role="radiogroup">
        ${opts
          .map(
            ([v, t]) => `<label class="opt opt-${v}"><input type="radio" name="${esc(name)}" value="${v}" ${value === v ? 'checked' : ''}><span>${t}</span></label>`,
          )
          .join('')}
      </div>
    </div>`;
}

/** Opdaterer markering af besvarede spørgsmål uden at gentegne (bevarer fokus). */
function opdaterMarkering(root) {
  for (const q of root.querySelectorAll('.q')) {
    const valgt = q.querySelector('input[type=radio]:checked');
    const tal = q.querySelector('input[type=number]');
    q.classList.toggle('answered', Boolean(valgt) || (tal && tal.value !== ''));
    q.classList.toggle('is-ja', valgt?.value === 'ja');
  }
}

function renderScreening() {
  $('#screening').innerHTML = SCREENING.map((q) => {
    const p = state.jev?.screening?.[q.id];
    const tag = p >= 0.5 ? ` <span class="jev-tag" title="Jev vurderer, at henvendelsen nævner dette">Jev ${Math.round(p * 100)} %</span>` : '';
    return janejHtml(`scr:${q.id}`, state.screening[q.id], q.tekst, q.niveau === L.LIVSTRUENDE ? 'red-flag' : 'orange-flag').replace(
      `${esc(q.tekst)}</div>`,
      `${esc(q.tekst)}${tag}</div>`,
    );
  }).join('');
  opdaterMarkering($('#screening'));
}

function renderRisiko() {
  $('#risiko').innerHTML = RISIKOFAKTORER.map(
    (r) => `<label class="check"><input type="checkbox" data-risiko="${r.id}" ${state.risiko.has(r.id) ? 'checked' : ''}> ${esc(r.tekst)}</label>`,
  ).join('');
  $('#risk-count').textContent = state.risiko.size ? `(${state.risiko.size})` : '';
}

function renderModifikatorer() {
  $('#modifikatorer').innerHTML = MODIFIKATORER.map(
    (m) => `<label class="check"><input type="checkbox" data-mod="${m.id}" ${state.modifikatorer[m.id] ? 'checked' : ''}> ${esc(m.tekst)}</label>`,
  ).join('');
}

function renderProtokolvalg() {
  const p = patientKontekst(patientInput());
  const synlige = soegProtokoller(state.soeg, p.alderAar === undefined ? undefined : p);
  const grupper = new Map();
  for (const prot of synlige) {
    if (!grupper.has(prot.gruppe)) grupper.set(prot.gruppe, []);
    grupper.get(prot.gruppe).push(prot);
  }
  let html = '';
  for (const [gruppe, liste] of grupper) {
    html += `<div class="chip-group"><div class="chip-group-title">${esc(gruppe)}</div>`;
    html += liste
      .map((prot) => {
        const valgt = state.valgte.includes(prot.id);
        return `<button type="button" class="chip ${valgt ? 'selected' : ''}" data-protokol="${prot.id}" aria-pressed="${valgt}">${esc(prot.titel)}</button>`;
      })
      .join('');
    html += '</div>';
  }
  if (!synlige.length) html = '<p class="hint">Ingen protokol matcher. Vælg "Andet / ikke dækket af protokol".</p>';
  // Valgte protokoller, der er filtreret væk af søgningen, vises stadig.
  const skjulteValgte = state.valgte.filter((id) => !synlige.some((s) => s.id === id));
  if (skjulteValgte.length) {
    html =
      `<div class="chip-group"><div class="chip-group-title">Valgt</div>${skjulteValgte
        .map((id) => `<button type="button" class="chip selected" data-protokol="${id}" aria-pressed="true">${esc(hentProtokol(id).titel)}</button>`)
        .join('')}</div>` + html;
  }
  $('#protokolvalg').innerHTML = html;
}

function spoergsmaalHtml(prot, q, svar) {
  const name = `p:${prot.id}:${q.id}`;
  const attrs = `data-q="${esc(prot.id)}:${esc(q.id)}"`;
  const v = svar[q.id];
  if (q.type === 'janej') return janejHtml(name, v, q.tekst, '', attrs);
  if (q.type === 'tal') {
    return `
      <div class="q" ${attrs}>
        <div class="q-text">${esc(q.tekst)}${q.valgfri ? ' <span class="opt-tag">valgfri</span>' : ''}</div>
        <div class="q-opts"><label class="inline"><input type="number" step="any" name="${esc(name)}" value="${esc(v ?? '')}" min="${q.min ?? ''}" max="${q.max ?? ''}" inputmode="decimal"> ${esc(q.enhed ?? '')}</label></div>
      </div>`;
  }
  if (q.type === 'valg') {
    return `
      <div class="q" ${attrs}>
        <div class="q-text">${esc(q.tekst)}</div>
        <div class="q-opts q-opts-wrap">
          ${q.valgmuligheder
            .map((o) => `<label class="opt"><input type="radio" name="${esc(name)}" value="${esc(o.v)}" ${v === o.v ? 'checked' : ''}><span>${esc(o.t)}</span></label>`)
            .join('')}
        </div>
      </div>`;
  }
  return '';
}

/** Tegner protokolkort med ALLE spørgsmål; betingede spørgsmål skjules med hidden. */
function renderProtokoller() {
  $('#protokoller').innerHTML = state.valgte
    .map((id) => {
      const prot = hentProtokol(id);
      const svar = state.svar[id] ?? {};
      return `
        <section class="card protokol">
          <h2><span class="step">4</span> ${esc(prot.titel)}
            <button type="button" class="btn-link" data-fjern="${prot.id}">Fjern</button></h2>
          <div class="questions">${prot.spoergsmaal.map((q) => spoergsmaalHtml(prot, q, svar)).join('')}</div>
        </section>`;
    })
    .join('');
  opdaterProtokoller();
}

/** Opdaterer synlighed og markering af protokolspørgsmål uden at gentegne. */
function opdaterProtokoller() {
  const p = patientKontekst(patientInput());
  for (const id of state.valgte) {
    const svar = state.svar[id] ?? {};
    for (const q of hentProtokol(id).spoergsmaal) {
      const el = document.querySelector(`#protokoller [data-q="${CSS.escape(`${id}:${q.id}`)}"]`);
      if (el) el.hidden = Boolean(q.visHvis) && !q.visHvis(svar, p);
    }
  }
  opdaterMarkering($('#protokoller'));
}

// ---------- Resultat ----------

function levelBadgeHtml(id) {
  return levelBadge({ id, farve: LEVELS[id].farve });
}

function levelBadge(info) {
  return `<span class="badge lvl-${info.id}">${esc(info.farve)}</span>`;
}

let sidsteResultat;
function evaluer() {
  const nu = new Date();
  const resultat = visiter({
    patient: patientInput(),
    screening: state.screening,
    protokoller: state.valgte.map((id) => ({ id, svar: state.svar[id] ?? {} })),
    modifikatorer: state.modifikatorer,
    tidspunkt: nu,
    config: config(),
    jev: state.jev,
  });
  sidsteResultat = resultat;
  renderResultat(resultat);
  renderAlarm(resultat);
  renderMini(resultat);
  renderNotat(resultat, nu);
}

function renderMini(r) {
  const el = $('#mini');
  el.className = `mini lvl-${r.niveau}`;
  el.textContent = `${r.info.farve}${r.komplet ? '' : ' (foreløbig)'}: ${r.info.titel}${r.mangler.length ? ` · ${r.mangler.length} mangler` : ''}`;
}

function renderAlarm(r) {
  const el = $('#alarm');
  if (r.niveau === L.LIVSTRUENDE) {
    el.hidden = false;
    el.innerHTML = `<strong>RING 112 NU</strong> – ${esc(r.afgoerende.map((b) => b.tekst).join('; '))}. Bliv i røret, indtil 112 er kontaktet.`;
  } else {
    el.hidden = true;
  }
}

function renderResultat(r) {
  const info = r.info;
  const manglerTekst = r.mangler.length
    ? `<div class="missing"><strong>${r.mangler.length} spørgsmål mangler</strong> – resultatet er foreløbigt.
        <button type="button" class="btn-link" id="gaa-til-mangler">Gå til næste</button></div>`
    : '';
  const provisorisk = !r.komplet;
  $('#result').innerHTML = `
    <div class="result-inner">
      <div class="level lvl-${info.id} ${provisorisk ? 'provisional' : ''}">
        <div class="level-color">${esc(info.farve)}${provisorisk ? ' · foreløbig' : ''}</div>
        <div class="level-title">${esc(info.titel)}</div>
        <div class="level-desc">${esc(info.beskrivelse)}</div>
      </div>
      ${manglerTekst}
      ${r.kraeverLaege ? '<div class="doctor">Lægen skal orienteres/godkende visitationen</div>' : ''}
      <div class="block">
        <h3>Handling ${r.aaben ? '<span class="open">praksis åben</span>' : '<span class="closed">uden for åbningstid</span>'}</h3>
        <ul>${r.handlinger.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
        ${r.ruter.length ? `<ul class="routes">${r.ruter.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      </div>
      ${
        r.begrundelser.length
          ? `<div class="block">
        <h3>Begrundelse</h3>
        <ul class="reasons">${r.begrundelser
          .filter((b) => !b.standard || b.niveau === r.niveau)
          .map((b) => `<li class="${b.niveau === r.niveau && !b.info ? 'decisive' : ''}">${levelBadgeHtml(b.niveau)} ${esc(b.tekst)} <span class="src">${esc(b.kilde)}</span></li>`)
          .join('')}</ul>
      </div>`
          : ''
      }
      ${r.advarsler.length ? `<div class="block warn">${r.advarsler.map(esc).join('<br>')}</div>` : ''}
      ${
        r.raad.length
          ? `<div class="block"><h3>Råd til indringer</h3><ul>${r.raad.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
          : ''
      }
      ${
        r.sikkerhedsnet.length
          ? `<div class="block"><h3>Sikkerhedsnet – sig altid</h3><ul>${r.sikkerhedsnet.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
          : ''
      }
    </div>`;
}

function renderNotat(r, nu) {
  const forstaaetVal = document.querySelector('input[name="forstaaet"]:checked')?.value;
  $('#notat').value = lavJournalnotat(r, {
    tidspunkt: nu,
    visitator: $('#visitator').value.trim(),
    rolle: $('#rolle').value,
    indringer: $('#indringer').value,
    kontaktaarsag: $('#kontaktaarsag').value.trim(),
    screening: state.screening,
    modifikatorer: state.modifikatorer,
    laegeKonsulteret: $('#laegeKonsulteret').value.trim(),
    forstaaet: forstaaetVal === undefined ? undefined : forstaaetVal === 'ja',
    fritekst: $('#fritekst').value.trim(),
  });
}

function opdaterPatientFelter() {
  const p = patientKontekst(patientInput());
  $('#gravid-wrap').hidden = !p.kanVaereGravid;
  $('#gravidUge-wrap').hidden = !(p.kanVaereGravid && $('#gravid').checked);
}

function renderAlt() {
  opdaterPatientFelter();
  renderScreening();
  renderRisiko();
  renderProtokolvalg();
  renderProtokoller();
  renderModifikatorer();
  renderJev();
  evaluer();
}

// ---------- Jev (TypeSafe AI) ----------

let jevAktiv = false;

async function tjekJev() {
  const status = $('#jev-status');
  try {
    const r = await fetch('api/jev/status', { cache: 'no-store' });
    if (!r.ok) throw new Error();
    const s = await r.json();
    jevAktiv = s.aktiv;
    status.textContent = s.aktiv ? (s.simuleret ? 'SIMULERET Jev – kun til demonstration' : 'Jev aktiv') : `Jev ikke aktiv: ${s.tilstand}`;
    status.classList.toggle('sim', Boolean(s.simuleret));
  } catch {
    jevAktiv = false;
    status.textContent = 'Jev ikke tilgængelig – start med: npm run jev:start';
  }
  $('#jev-knap').disabled = !jevAktiv;
}

async function analyserMedJev() {
  const tekst = $('#kontaktaarsag').value.trim();
  if (!tekst) {
    state.jevFejl = 'Skriv kontaktårsagen med indringers egne ord først.';
    return renderJev();
  }
  const knap = $('#jev-knap');
  knap.disabled = true;
  knap.textContent = 'Analyserer …';
  const p = patientInput();
  try {
    const r = await fetch('api/jev/vurder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tekst, alderAar: p.alderAar, koen: p.koen }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.fejl || `Fejl ${r.status}`);
    state.jev = data;
    state.jevTekst = tekst;
    state.jevFejl = '';
  } catch (e) {
    state.jevFejl = `${e.message} Visitér efter protokollen.`;
  } finally {
    knap.disabled = !jevAktiv;
    knap.textContent = 'Analysér med Jev';
  }
  renderJev();
  renderScreening();
  evaluer();
}

function renderJev() {
  const el = $('#jev-resultat');
  if (state.jevFejl) {
    el.innerHTML = `<div class="jev-box"><span class="err">${esc(state.jevFejl)}</span></div>`;
    return;
  }
  const j = state.jev;
  if (!j) {
    el.innerHTML = '';
    return;
  }
  const p = patientKontekst(patientInput());
  const forslag = j.protokolForslag
    .map((f) => ({ ...f, prot: PROTOKOLLER.find((x) => x.id === f.id) }))
    .filter((f) => f.prot && (!f.prot.gaelderFor || p.alderAar === undefined || f.prot.gaelderFor(p)));
  const niveau = LEVELS[j.hastegrad.niveau];
  const stale = $('#kontaktaarsag').value.trim() !== state.jevTekst;
  el.innerHTML = `
    <div class="jev-box">
      <div class="chips-row"><strong>Foreslåede protokoller:</strong>
        ${
          forslag.length
            ? forslag
                .map((f) => {
                  const valgt = state.valgte.includes(f.id);
                  return `<button type="button" class="chip ${valgt ? 'selected' : ''}" data-protokol="${f.id}" aria-pressed="${valgt}">${esc(f.prot.titel)} · ${Math.round(f.sandsynlighed * 100)} %</button>`;
                })
                .join('')
            : '<span class="hint">ingen – vælg manuelt</span>'
        }
      </div>
      <div>Jevs hastegrad: ${levelBadgeHtml(niveau.id)} ${esc(niveau.titel)} · sikkerhed ${Math.round(j.hastegrad.sikkerhed * 100)} % · livstruende ${Math.round(j.livstruende * 100)} %</div>
      <div class="hint">Model: ${esc(j.model)} · ${esc(j.latensMs)} ms${j.sendtTekst !== state.jevTekst ? ' · personoplysninger fjernet før afsendelse' : ''}</div>
      ${stale ? '<div class="stale">Teksten er ændret siden analysen – analysér igen.</div>' : ''}
    </div>`;
}

// ---------- Hændelser ----------

function haandterRadio(target) {
  const [kind, a, b] = target.name.split(':');
  if (kind === 'scr') {
    state.screening[a] = target.value;
    opdaterMarkering($('#screening'));
    return true;
  }
  if (kind === 'p') {
    state.svar[a] = { ...(state.svar[a] ?? {}), [b]: target.value };
    opdaterProtokoller();
    return true;
  }
  return false;
}

function bind() {
  const form = $('#form');
  form.addEventListener('submit', (e) => e.preventDefault());

  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.type === 'radio' && haandterRadio(t)) return evaluer();
    if (t.dataset.risiko) {
      t.checked ? state.risiko.add(t.dataset.risiko) : state.risiko.delete(t.dataset.risiko);
      $('#risk-count').textContent = state.risiko.size ? `(${state.risiko.size})` : '';
      return evaluer();
    }
    if (t.dataset.mod) {
      state.modifikatorer[t.dataset.mod] = t.checked;
      return evaluer();
    }
    if (t.type === 'number' && t.name?.startsWith('p:')) {
      opdaterProtokoller();
      return evaluer();
    }
    if (['alderAar', 'alderMdr', 'gravid', 'gravidUge'].includes(t.id) || t.name === 'koen') {
      opdaterPatientFelter();
      renderProtokolvalg();
      opdaterProtokoller();
      renderJev();
    }
    evaluer();
  });

  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.type === 'number' && t.name?.startsWith('p:')) {
      const [, a, b] = t.name.split(':');
      state.svar[a] = { ...(state.svar[a] ?? {}), [b]: t.value };
      opdaterProtokoller(); // synlighed kan afhænge af tal (fx graviditetsuge)
      return evaluer();
    }
    if (t.id === 'soeg') {
      state.soeg = t.value;
      return renderProtokolvalg();
    }
    if (t.id === 'kontaktaarsag' && state.jev) renderJev();
    if (t.type === 'text' || t.tagName === 'TEXTAREA') evaluer();
  });

  form.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-protokol]');
    if (chip) {
      const id = chip.dataset.protokol;
      state.valgte = state.valgte.includes(id) ? state.valgte.filter((x) => x !== id) : [...state.valgte, id];
      renderJev();
      renderProtokolvalg();
      renderProtokoller();
      evaluer();
      return;
    }
    const fjern = e.target.closest('[data-fjern]');
    if (fjern) {
      state.valgte = state.valgte.filter((x) => x !== fjern.dataset.fjern);
      renderJev();
      renderProtokolvalg();
      renderProtokoller();
      evaluer();
    }
  });

  $('#result').addEventListener('click', (e) => {
    if (e.target.id !== 'gaa-til-mangler' || !sidsteResultat?.mangler.length) return;
    const m = sidsteResultat.mangler[0];
    let el;
    if (m.kilde === 'screening') el = document.querySelector(`input[name="scr:${m.id}"]`);
    else if (m.kilde === 'protokol') el = $('#soeg');
    else el = document.querySelector(`input[name="p:${m.kilde}:${m.id}"]`);
    el?.closest('.q, input')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  });

  $('#kopier').addEventListener('click', async () => {
    const btn = $('#kopier');
    try {
      await navigator.clipboard.writeText($('#notat').value);
      btn.textContent = 'Kopieret ✓';
    } catch {
      $('#notat').select();
      document.execCommand?.('copy');
      btn.textContent = 'Markeret – tryk Ctrl+C';
    }
    setTimeout(() => (btn.textContent = 'Kopiér notat'), 2000);
  });

  $('#reset').addEventListener('click', () => {
    if (!confirm('Start ny visitation? Alle indtastninger slettes.')) return;
    nulstil();
  });

  $('#jev-knap').addEventListener('click', analyserMedJev);
  $('#kontaktaarsag').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && jevAktiv) analyserMedJev();
  });

  $('#mini').addEventListener('click', () => $('#result').scrollIntoView({ behavior: 'smooth' }));

  $('#region').addEventListener('change', (e) => {
    gemRegion(e.target.value);
    evaluer();
  });
}

function nulstil() {
  state = nyState();
  $('#form').reset();
  $('#soeg').value = '';
  renderAlt();
  window.scrollTo({ top: 0 });
}

function tickClock() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleString('da-DK', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

function foelgHeaderhoejde() {
  const header = document.querySelector('.topbar');
  const set = () => document.documentElement.style.setProperty('--hdr', `${header.offsetHeight}px`);
  new ResizeObserver(set).observe(header);
  set();
}

function init() {
  foelgHeaderhoejde();
  $('#region').innerHTML = Object.entries(REGIONER)
    .map(([k, v]) => `<option value="${k}">${esc(v.navn.replace('Region ', ''))}</option>`)
    .join('');
  $('#region').value = hentRegion();
  state = nyState();
  bind();
  renderAlt();
  tjekJev();
  tickClock();
  setInterval(() => {
    tickClock();
    evaluer(); // åbningstid kan skifte undervejs
  }, 60_000);
}

init();
