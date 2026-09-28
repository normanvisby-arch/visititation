# Telefonvisitation – beslutningsstøtte til almen praksis

Et program til struktureret telefonvisitation af patienter i almen praksis. Programmet
guider lægesekretær, sygeplejerske eller læge gennem samtalen, foreslår hastegrad og
handling, giver råd og sikkerhedsnet til patienten og laver et færdigt journalnotat.

> **Vigtigt:** Programmet er et beslutningsstøtteværktøj og erstatter ikke klinisk
> vurdering. Visitation ved ikke-lægeligt personale sker som medhjælp under lægens
> ansvar (autorisationslovens § 17) og efter praksis' egen instruks. Protokollerne skal
> gennemgås og godkendes af praksis' læger, før programmet tages i brug. Ved tvivl:
> kontakt lægen.

## Kom i gang

Kræver Node.js 18 eller nyere. Ingen afhængigheder skal installeres.

```bash
npm start      # starter på http://127.0.0.1:8080
npm test       # kører testene af beslutningsmotoren
```

Programmet kører udelukkende i browseren. **Der gemmes ingen patientdata** – kun valg af
region huskes lokalt. Journalnotatet kopieres over i praksis' journalsystem.

## Jev – AI-beslutningslag (TypeSafe AI)

Programmet kan bruge [Jev](https://docs.typesafe.ai) fra TypeSafe AI, en ikke-autoregressiv
"System One"-beslutningsmodel, som et hurtigt ekstra lag – efter mønstret fra
[zazencodes' Jev-demo](https://github.com/zazencodes/zazencodes-season-3/tree/main/src/jev-system-one-model-python-demo).
Indringers fritekst ("kontaktårsag") evalueres i **ét parallelt kald** med typede spørgsmål:

| Spørgsmål          | Type     | Bruges til                                                 |
|--------------------|----------|------------------------------------------------------------|
| `kontaktaarsag`    | `Choice` | Forslag til symptomprotokol (klik for at vælge)             |
| `hastegrad`        | `Score`  | Jevs bud på hastegrad (hvid → rød) med kalibreret sikkerhed |
| `livstruende`      | `Noul`   | Sandsynlighed for livstruende tilstand                      |
| `uklar`            | `Noul`   | Er henvendelsen for uklar til sikker vurdering              |
| `screening__<id>`  | `Noul`   | Markerer ABCDE-spørgsmål, som teksten ser ud til at nævne   |

### Sikkerhedsprincipper for Jev

Jev er en AI-model og kan tage fejl. Derfor gælder (`anvendJev` i `src/engine.js`):

- **Jev kan kun hæve hastegraden – aldrig sænke den regelbaserede vurdering.**
- **Jev kan højst hæve til orange.** Rød/112 kræver, at visitator bekræfter et
  alarmsymptom i screeningen. Ved livstruende ≥ 50 % bliver det orange, og der vises en
  advarsel om at gennemgå screeningen igen.
- **Lav sikkerhed (< 75 %) eller uklar tekst → lægen skal godkende visitationen**
  (svarer til demoens "eskalér til System 2/menneske").
- Når Jev hæver hastegraden, skal lægen altid orienteres.
- Jev besvarer aldrig screeningsspørgsmålene – den markerer dem kun ("Jev 90 %").
- Fejler Jev (netværk, nøgle, rate limit), visiteres der blot efter protokollerne.
- Jevs bidrag skrives i journalnotatet.

### Databeskyttelse

Kun kontaktårsagen, alder og køn sendes til TypeSafe AI. Før afsendelse fjernes CPR-numre,
telefonnumre og e-mailadresser automatisk, og brugerfladen beder om, at navne ikke
skrives. **Helbredsoplysninger må først sendes til TypeSafe AI, når der er indgået en
databehandleraftale, og behandlingen er vurderet efter GDPR (fx overførsel til tredjeland).**
API-nøglen ligger kun på serveren.

### Start med Jev

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r jev/requirements.txt
cp .env.example .env          # indsæt TYPESAFE_API_KEY
npm run jev:start             # = python3 -m jev.server → http://127.0.0.1:8080

python3 -m jev.server --simuler   # simuleret Jev uden nøgle (nøgleordsregler, ingen klinisk værdi)
python3 -m jev.demo [--simuler]   # CLI-demo med eksempelhenvendelser
npm run jev:test                  # Python-tests (bruger rigtig SDK med mock-transport)
```

Kataloget over protokoller, som Jev vælger imellem, genereres fra JavaScript-protokollerne:
`npm run jev:katalog` (en test fejler, hvis det ikke er opdateret).

## Arbejdsgang

1. **Opkald og patient** – visitator, indringer, alder, køn, graviditet og risikofaktorer.
2. **Livstruende symptomer (ABCDE)** – stilles altid først. Et "Ja" udløser straks en
   rød 112-alarm. "Ved ikke" kan ikke afkræfte livsfare og giver orange.
3. **Kontaktårsag** – vælg en eller flere symptomprotokoller (søgbar liste, filtreret
   efter alder og køn).
4. **Symptomspecifikke spørgsmål** – betingede spørgsmål vises kun når relevant
   (fx fosterbevægelser efter uge 22).
5. **Øvrige forhold** – gentagen henvendelse, bekymring, kan ikke vurderes pr. telefon,
   visitators mavefornemmelse.
6. **Afslutning** – bekræft at indringer har forstået planen, evt. lægegodkendelse, og
   kopiér journalnotatet.

Resultatpanelet opdateres løbende og viser hastegrad, handling (afhængig af åbningstid),
eventuel henvisningsvej, begrundelse, råd og sikkerhedsnet. Så længe spørgsmål mangler,
markeres resultatet som *foreløbigt*.

## Hastegrader

| Farve  | Hastegrad                      | Handling i åbningstid                           | Uden for åbningstid                     |
|--------|--------------------------------|-------------------------------------------------|-----------------------------------------|
| Rød    | Livstruende                    | Ring 112 nu, bliv i røret                       | Ring 112 nu                             |
| Orange | Akut – lægen vurderer straks   | Afbryd lægen; tilses/vurderes inden for 1 time  | Henvis straks til 1813/lægevagt         |
| Gul    | Lægekontakt samme dag          | Tid eller lægelig telefonkonsultation i dag     | 1813/lægevagt – bør vurderes i dag      |
| Grøn   | Inden for 1-3 hverdage         | Tid inden for 1-3 hverdage                      | Kontakt praksis næste hverdag           |
| Blå    | Planlagt kontakt               | E-konsultation, telefontid, tid inden for 1-2 uger | Samme                                |
| Hvid   | Egenomsorg                     | Råd og sikkerhedsnet                            | Samme                                   |

## Beslutningsregler

Beslutningsmotoren (`src/engine.js`) følger forsigtighedsprincippet:

- **Højeste niveau vinder.** Den samlede hastegrad er den højeste af screeningen, alle
  valgte protokoller og modifikatorer.
- **Protokollens standardniveau er et bundniveau.** Regler kan kun hæve hastegraden.
- **"Ved ikke" ved alarmsymptomer** behandles som et muligt alarmsymptom.
- **Risikogrupper** (nedsat immunforsvar, kemoterapi, hjerte-/lungesygdom, diabetes,
  AK-behandling, nyresygdom, skrøbelighed, graviditet, alder ≥ 85) hæver hastegraden ét
  niveau, højst til samme dag. Spædbørn under 3 måneder ses altid samme dag.
- **Modifikatorer** (gentagen henvendelse, udtalt bekymring, kan ikke vurderes pr.
  telefon, visitators mavefornemmelse) giver mindst samme dag. Mavefornemmelse kræver
  desuden lægegodkendelse.
- Orange og rød samt "Andet"-protokollen markeres altid til lægens orientering.
- Kun svar på synlige spørgsmål tæller – skjulte, forældede svar ignoreres.

## Symptomprotokoller

| Gruppe                        | Protokoller |
|-------------------------------|-------------|
| Hjerte og kredsløb            | Brystsmerter, Åndenød, Hjertebanken, Hævet/smertende ben |
| Infektion og feber            | Feber (voksen), Feber (barn), Hoste/forkølelse, Ondt i halsen, Ørepine |
| Mave, tarm og urinveje        | Mavesmerter, Diarré/opkastning, Urinvejssymptomer |
| Nervesystem og psyke          | Hovedpine, Lammelse/føleforstyrrelse/talebesvær, Svimmelhed/besvimelse, Psykisk krise |
| Skader og hud                 | Skade/sår/forbrænding, Udslæt/hud, Allergisk reaktion, Øjne/syn |
| Graviditet, kvinder og børn   | Graviditet |
| Muskler og led                | Rygsmerter |
| Øvrige / administrativt       | Diabetes/blodsukker, Forgiftning, Recept/prøvesvar/attest, Andet |

### Fagligt grundlag

Alarmsymptomer og tærskler er bygget på almindeligt anerkendte principper i dansk og
international akut- og almen medicin, herunder:

- ABCDE-princippet og symptomkriterierne i *Dansk Indeks for Akuthjælp*
  (fx aktuelle trykkende brystsmerter, FAST-symptomer, petekkier med feber).
- DSAM's vejledninger og kliniske anbefalinger om telefonkonsultation og akut
  visitation i almen praksis.
- Sepsis-tegn hos voksne (forvirring, hurtig vejrtrækning, nedsat diurese) og
  trafiklys-princippet for feber hos børn (NICE NG143).
- Relevante kliniske tærskler: Centor-kriterier ved halsbetændelse, TIA inden for en
  uge som akut, feber hos spædbørn < 3 mdr., neutropen feber ved kemoterapi,
  cauda equina, tordenskraldshovedpine, testikeltorsion m.fl.
- Journalføringsbekendtgørelsens krav til journalføring af telefoniske kontakter
  (tidspunkt, hvem, oplysninger, vurdering, beslutning, information givet).

Protokollerne er ikke en officiel godkendt standard og skal valideres lokalt.

## Tilpasning

`src/config.js` indeholder praksisnavn, region/vagttelefon, åbningstider og lukkedage.
**Telefonnumre og åbningstider skal verificeres lokalt.**

### Tilføj eller ret en protokol

En protokol er et almindeligt JavaScript-objekt i `src/protocols/`:

```js
export const eksempel = {
  id: 'eksempel',
  titel: 'Eksempel',
  gruppe: 'Øvrige',
  soegeord: ['eksempel'],
  gaelderFor: (p) => p.alderAar >= 16,          // valgfri
  spoergsmaal: [
    { id: 'alarm', tekst: 'Er der alarmsymptom X?', type: 'janej' },
    { id: 'temp', tekst: 'Temperatur', type: 'tal', enhed: '°C', valgfri: true },
    { id: 'betinget', tekst: '…', type: 'janej', visHvis: (a, p) => a.alarm === 'ja' },
  ],
  regler: [
    { niveau: L.AKUT, hvis: (a, p) => ja(a, 'alarm'), tekst: 'Begrundelse', rute: 'skadestue' },
  ],
  standard: () => ({ niveau: L.EGENOMSORG, tekst: 'Ingen alarmsymptomer' }),
  raad: ['Råd til indringer'],
  sikkerhedsnet: ['Kontakt igen hvis …'],
};
```

Registrér protokollen i `src/protocols/index.js`. Testene i `test/` kontrollerer bl.a.,
at alle protokoller har gyldig struktur, kan afsluttes, og ikke giver høj hastegrad når
alle alarmsymptomer er afkræftet.

## Projektstruktur

```
index.html            Brugerflade
app/app.js            UI-logik (ingen frameworks)
app/style.css         Layout og farver
src/engine.js         Beslutningsmotor
src/screening.js      ABCDE-screening
src/protocols/        Symptomprotokoller
src/journal.js        Journalnotat
src/levels.js         Hastegrader
src/config.js         Praksisopsætning, åbningstider, vagtnumre
server.js             Lille statisk webserver (uden Jev)
jev/vurdering.py      Jev-spørgsmål, fortolkning og rensning af personoplysninger
jev/server.py         Webserver med Jev-API
jev/simuleret.py      Simuleret Jev til demo/test
jev/demo.py           CLI-demo
jev/katalog.json      Protokolkatalog (genereret)
scripts/              Eksport af protokolkatalog
test/                 Tests (node --test)
```
