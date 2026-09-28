// Eksporterer protokol- og screeningskataloget til jev/katalog.json, så Python-
// integrationen med Jev bruger præcis de samme protokoller som beslutningsmotoren.
// Kør: npm run jev:katalog
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROTOKOLLER } from '../src/protocols/index.js';
import { SCREENING } from '../src/screening.js';
import { LEVELS } from '../src/levels.js';

export function byggKatalog() {
  return {
    protokoller: PROTOKOLLER.map((p) => ({ id: p.id, titel: p.titel, gruppe: p.gruppe, soegeord: p.soegeord })),
    screening: SCREENING.map((q) => ({ id: q.id, tekst: q.tekst, niveau: q.niveau })),
    hastegrader: LEVELS.map((l) => ({ id: l.id, farve: l.farve, titel: l.titel, beskrivelse: l.beskrivelse })),
  };
}

export const KATALOG_STI = fileURLToPath(new URL('../jev/katalog.json', import.meta.url));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(KATALOG_STI, `${JSON.stringify(byggKatalog(), null, 2)}\n`);
  console.log(`Skrev ${KATALOG_STI}`);
}
