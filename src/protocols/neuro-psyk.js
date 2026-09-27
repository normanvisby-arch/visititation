import { L } from '../levels.js';
import { ja, jaEllerUkendt, valg } from '../helpers.js';

export const hovedpine = {
  id: 'hovedpine',
  titel: 'Hovedpine',
  gruppe: 'Nervesystem og psyke',
  soegeord: ['hoved', 'migræne', 'hovedpine'],
  spoergsmaal: [
    { id: 'tordenskrald', tekst: 'Opstod hovedpinen pludseligt og eksplosivt (værste nogensinde, maksimal inden for et minut)?', type: 'janej' },
    { id: 'neuro', tekst: 'Lammelser, føleforstyrrelser, talebesvær, dobbeltsyn eller forvirring?', type: 'janej' },
    { id: 'feber_nakke', tekst: 'Feber og nakkestivhed?', type: 'janej' },
    { id: 'traume', tekst: 'Er hovedpinen opstået efter slag mod hovedet?', type: 'janej' },
    { id: 'graviditet', tekst: 'Gravid efter uge 20 eller født inden for 6 uger, med hovedpine, synsforstyrrelser eller hævelser?', type: 'janej', visHvis: (a, p) => p.kanVaereGravid },
    { id: 'tinding', tekst: 'Over 50 år med ny hovedpine, ømhed ved tindingen eller smerter i kæben ved tygning?', type: 'janej', visHvis: (a, p) => (p.alderAar ?? 99) >= 50 },
    { id: 'progressiv', tekst: 'Tiltagende hovedpine over dage-uger, værst om morgenen eller med opkastninger?', type: 'janej' },
    { id: 'kulilte', tekst: 'Har flere i husstanden hovedpine/kvalme (mulig kulilteforgiftning)?', type: 'janej' },
    { id: 'kendt', tekst: 'Kender patienten hovedpinen (fx sin sædvanlige migræne) og er den som den plejer?', type: 'janej' },
  ],
  regler: [
    { niveau: L.LIVSTRUENDE, hvis: (a) => ja(a, 'tordenskrald'), tekst: 'Tordenskraldshovedpine – mulig hjerneblødning' },
    { niveau: L.LIVSTRUENDE, hvis: (a) => ja(a, 'neuro'), tekst: 'Hovedpine med neurologiske udfald' },
    { niveau: L.AKUT, hvis: (a) => ja(a, 'feber_nakke'), tekst: 'Feber og nakkestivhed – mulig meningitis' },
    { niveau: L.AKUT, hvis: (a) => ja(a, 'traume'), tekst: 'Hovedpine efter hovedtraume' },
    { niveau: L.AKUT, hvis: (a) => ja(a, 'graviditet'), tekst: 'Mulig svangerskabsforgiftning (præeklampsi)', rute: 'foedeafdeling' },
    { niveau: L.AKUT, hvis: (a) => ja(a, 'kulilte'), tekst: 'Mulig kulilteforgiftning – forlad boligen og luft ud' },
    { niveau: L.SAMME_DAG, hvis: (a) => ja(a, 'tinding'), tekst: 'Mulig kæmpecellearteritis (tindingearteritis)' },
    { niveau: L.SAMME_DAG, hvis: (a) => ja(a, 'progressiv'), tekst: 'Progredierende hovedpine med alarmsymptomer' },
  ],
  standard: (a) =>
    ja(a, 'kendt')
      ? { niveau: L.EGENOMSORG, tekst: 'Kendt hovedpine uden alarmsymptomer' }
      : { niveau: L.FAA_DAGE, tekst: 'Ny hovedpine uden alarmsymptomer' },
  raad: ['Hvil i mørkt rum, drik vand, brug vanlig smertestillende efter indlægssedlen. Undgå dagligt forbrug af smertestillende.'],
  sikkerhedsnet: ['Ring 112 ved pludselig voldsom hovedpine, lammelser, talebesvær eller bevidsthedspåvirkning.'],
};

export const neurologi = {
  id: 'neurologi',
  titel: 'Lammelse / føleforstyrrelse / talebesvær',
  gruppe: 'Nervesystem og psyke',
  soegeord: ['apopleksi', 'blodprop', 'tia', 'lammelse', 'tale', 'syn', 'føleforstyrrelse', 'forvirring'],
  spoergsmaal: [
    { id: 'nu', tekst: 'Er symptomerne til stede NU?', type: 'janej' },
    {
      id: 'hvornaar',
      tekst: 'Hvornår var symptomerne til stede (hvis de er gået over)?',
      type: 'valg',
      visHvis: (a) => a.nu === 'nej',
      valgmuligheder: [
        { v: 'under_7d', t: 'Inden for den seneste uge' },
        { v: 'over_7d', t: 'Mere end en uge siden' },
      ],
    },
    { id: 'forvirring', tekst: 'Ny opstået forvirring eller ændret adfærd (timer-dage)?', type: 'janej' },
    { id: 'ansigt_alene', tekst: 'Drejer det sig udelukkende om lammelse af den ene ansigtshalvdel inkl. panden (kan ikke rynke panden)?', type: 'janej' },
    { id: 'gradvis_foeleforstyrrelse', tekst: 'Snurren/prikken i hænder eller fødder, der er kommet gradvist over uger?', type: 'janej' },
  ],
  regler: [
    { niveau: L.LIVSTRUENDE, hvis: (a) => jaEllerUkendt(a, 'nu') && !ja(a, 'ansigt_alene') && !ja(a, 'gradvis_foeleforstyrrelse'), tekst: 'Aktuelle neurologiske udfald – mulig apopleksi' },
    { niveau: L.AKUT, hvis: (a) => valg(a, 'hvornaar') === 'under_7d', tekst: 'Forbigående udfald inden for en uge – mulig TIA (akut udredning)' },
    { niveau: L.AKUT, hvis: (a) => ja(a, 'forvirring'), tekst: 'Akut forvirringstilstand (delir)' },
    { niveau: L.SAMME_DAG, hvis: (a) => ja(a, 'ansigt_alene'), tekst: 'Perifer ansigtslammelse – behandling bør startes inden for 72 timer' },
    { niveau: L.FAA_DAGE, hvis: (a) => valg(a, 'hvornaar') === 'over_7d', tekst: 'Forbigående udfald for mere end en uge siden' },
  ],
  standard: () => ({ niveau: L.FAA_DAGE, tekst: 'Neurologiske symptomer uden akutte tegn' }),
  raad: [],
  sikkerhedsnet: ['Ring 112 straks, hvis der opstår skæv mund, lammelse, talebesvær eller synstab – også hvis det går over igen.'],
};

export const svimmelhed = {
  id: 'svimmelhed',
  titel: 'Svimmelhed / besvimelse',
  gruppe: 'Nervesystem og psyke',
  soegeord: ['svimmel', 'besvimelse', 'kollaps', 'synkope', 'dreje'],
  spoergsmaal: [
    { id: 'neuro', tekst: 'Samtidigt talebesvær, dobbeltsyn, lammelse, gangbesvær eller kan ikke gå/stå?', type: 'janej' },
    { id: 'anstrengelse', tekst: 'Besvimet under fysisk anstrengelse eller liggende?', type: 'janej' },
    { id: 'hjerte', tekst: 'Brystsmerter, hjertebanken eller åndenød før/efter?', type: 'janej' },
    { id: 'blodtab', tekst: 'Sort afføring, blodigt opkast eller anden blødning?', type: 'janej' },
    { id: 'slag', tekst: 'Slog hovedet ved faldet (og er i AK-behandling eller over 65 år)?', type: 'janej' },
    { id: 'besvimet', tekst: 'Har patienten været bevidstløs/besvimet?', type: 'janej' },
    { id: 'udloest', tekst: 'Klar udløsende årsag (lang tids stående, smerte, synet af blod) og hurtigt helt frisk igen?', type: 'janej' },
    { id: 'hovedbevaegelse', tekst: 'Kortvarig drejende svimmelhed, der kun udløses af hovedbevægelser?', type: 'janej' },
  ],
  regler: [
    { niveau: L.LIVSTRUENDE, hvis: (a) => ja(a, 'neuro'), tekst: 'Svimmelhed med neurologiske udfald – mulig apopleksi' },
    { niveau: L.AKUT, hvis: (a) => ja(a, 'anstrengelse'), tekst: 'Besvimelse under anstrengelse/liggende – mulig hjerteårsag' },
    { niveau: L.AKUT, hvis: (a) => ja(a, 'hjerte'), tekst: 'Svimmelhed/besvimelse med hjertesymptomer' },
    { niveau: L.AKUT, hvis: (a) => ja(a, 'blodtab'), tekst: 'Mulig blødning' },
    { niveau: L.AKUT, hvis: (a) => ja(a, 'slag'), tekst: 'Hovedtraume ved fald hos risikopatient' },
    {
      niveau: L.SAMME_DAG,
      hvis: (a) => ja(a, 'besvimet') && !ja(a, 'udloest'),
      tekst: 'Besvimelse uden klar godartet årsag',
    },
    { niveau: L.SAMME_DAG, hvis: (a, p) => ja(a, 'besvimet') && ((p.alderAar ?? 0) >= 65 || p.har('hjertesygdom')), tekst: 'Besvimelse hos ældre eller hjertesyg' },
  ],
  standard: (a) =>
    ja(a, 'hovedbevaegelse') || ja(a, 'udloest')
      ? { niveau: L.PLANLAGT, tekst: 'Sandsynlig godartet svimmelhed/besvimelse' }
      : { niveau: L.FAA_DAGE, tekst: 'Svimmelhed uden alarmsymptomer' },
  raad: ['Rejs dig langsomt. Drik rigeligt. Sæt eller læg dig ned ved svimmelhed for at undgå fald.'],
  sikkerhedsnet: ['Ring 112 ved talebesvær, lammelser, brystsmerter eller ny besvimelse.'],
};

export const psykisk = {
  id: 'psykisk',
  titel: 'Psykisk krise / selvmordstanker',
  gruppe: 'Nervesystem og psyke',
  soegeord: ['selvmord', 'depression', 'angst', 'psykose', 'krise', 'panik', 'abstinens', 'alkohol'],
  spoergsmaal: [
    { id: 'plan', tekst: 'Har patienten konkrete planer om selvmord eller adgang til midler (fx piller, våben)?', type: 'janej' },
    { id: 'tanker', tekst: 'Har patienten tanker om selvmord eller om at gøre skade på sig selv?', type: 'janej' },
    { id: 'psykotisk', tekst: 'Er patienten psykotisk (hører stemmer, forfølgelsesforestillinger, forvirret) eller til fare for andre?', type: 'janej' },
    { id: 'abstinens', tekst: 'Abstinenser med rysten, hallucinationer, forvirring eller kramper (alkohol/benzodiazepiner)?', type: 'janej' },
    { id: 'alene', tekst: 'Er patienten alene uden netværk, der kan være hos patienten?', type: 'janej' },
    { id: 'panik', tekst: 'Drejer det sig om et kendt angst-/panikanfald uden brystsmerter eller andre legemlige symptomer?', type: 'janej' },
    { id: 'forvaerring', tekst: 'Forværring af kendt depression/angst, som gør det svært at fungere i hverdagen?', type: 'janej' },
  ],
  regler: [
    { niveau: L.AKUT, hvis: (a) => jaEllerUkendt(a, 'plan'), tekst: 'Selvmordstanker med konkret plan – høj selvmordsrisiko', rute: 'psykiatri' },
    { niveau: L.AKUT, hvis: (a) => ja(a, 'psykotisk'), tekst: 'Psykotisk eller farlig for andre', rute: 'psykiatri' },
    { niveau: L.AKUT, hvis: (a) => ja(a, 'abstinens'), tekst: 'Svære abstinenser – mulig delirium tremens' },
    { niveau: L.AKUT, hvis: (a) => ja(a, 'tanker') && ja(a, 'alene'), tekst: 'Selvmordstanker hos patient uden netværk' },
    { niveau: L.SAMME_DAG, hvis: (a) => ja(a, 'tanker'), tekst: 'Selvmordstanker uden konkret plan – lægesamtale i dag' },
    { niveau: L.FAA_DAGE, hvis: (a) => ja(a, 'forvaerring'), tekst: 'Forværring af kendt psykisk lidelse' },
  ],
  standard: (a) =>
    ja(a, 'panik')
      ? { niveau: L.PLANLAGT, tekst: 'Kendt angst/panik uden alarmsymptomer' }
      : { niveau: L.FAA_DAGE, tekst: 'Psykisk belastning uden akutte tegn' },
  raad: ['Livslinien (anonym rådgivning ved selvmordstanker): 70 201 201.'],
  sikkerhedsnet: ['Ring 112 ved umiddelbar fare for liv. Pårørende bør ikke lade patienten være alene ved selvmordstanker med plan.'],
};
