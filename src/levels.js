// Hastegrader (triageniveauer) for telefonvisitation i almen praksis.
// Skalaen følger den gængse danske opdeling i livstruende / akut / samme dag /
// inden for få dage / planlagt / egenomsorg. Højere tal = mere hastende.

export const LEVELS = Object.freeze([
  {
    id: 0,
    key: 'EGENOMSORG',
    farve: 'Hvid',
    hex: '#e5e7eb',
    titel: 'Egenomsorg og råd',
    beskrivelse: 'Ingen konsultation nødvendig nu. Giv råd om egenomsorg og tydeligt sikkerhedsnet.',
  },
  {
    id: 1,
    key: 'PLANLAGT',
    farve: 'Blå',
    hex: '#3b82f6',
    titel: 'Planlagt kontakt',
    beskrivelse: 'E-konsultation, telefontid eller almindelig tid inden for 1-2 uger.',
  },
  {
    id: 2,
    key: 'FAA_DAGE',
    farve: 'Grøn',
    hex: '#16a34a',
    titel: 'Tid inden for 1-3 hverdage',
    beskrivelse: 'Konsultation eller lægelig telefonkonsultation inden for få hverdage.',
  },
  {
    id: 3,
    key: 'SAMME_DAG',
    farve: 'Gul',
    hex: '#eab308',
    titel: 'Lægekontakt samme dag',
    beskrivelse: 'Tid i dag eller lægelig telefonkonsultation i dag.',
  },
  {
    id: 4,
    key: 'AKUT',
    farve: 'Orange',
    hex: '#ea580c',
    titel: 'Akut – lægen vurderer straks',
    beskrivelse: 'Lægen afbrydes og tager stilling nu. Patienten ses/vurderes inden for 1 time eller henvises akut.',
  },
  {
    id: 5,
    key: 'LIVSTRUENDE',
    farve: 'Rød',
    hex: '#dc2626',
    titel: 'Livstruende – ring 112',
    beskrivelse: 'Ring 112 nu. Bliv i telefonen, indtil forbindelsen til 112 er etableret.',
  },
]);

export const L = Object.freeze({
  EGENOMSORG: 0,
  PLANLAGT: 1,
  FAA_DAGE: 2,
  SAMME_DAG: 3,
  AKUT: 4,
  LIVSTRUENDE: 5,
});

export function levelInfo(id) {
  const info = LEVELS[id];
  if (!info) throw new RangeError(`Ukendt hastegrad: ${id}`);
  return info;
}
