# Ekstern audit – Telefonvisitation med Jev

**Dato:** 28.09.2026 · **Version:** commit `44b122e` · **Omfang:** UX, klinisk indhold, brug af Jev (AI), databeskyttelse og applikationssikkerhed

## Metode

Tre uafhængige auditører har arbejdet hver for sig uden adgang til at ændre koden. De fik roller som:

- UX-/human factors-specialist
- speciallæge i almen medicin/akutmedicin
- AI-sikkerheds-, databeskyttelses- og sikkerhedsauditor

Metoderne var:

- **Klinik:** 60 kliniske vignetter kørt mod beslutningsmotoren.
- **UX:** 6 realistiske opkaldsscenarier gennemspillet i Chromium på desktop og mobil, plus kontrastberegninger efter WCAG 2.1.
- **Jev:** kodegennemgang af SDK-brugen, eksperimenter mod den simulerede Jev og den lokale server, og regex-tests af anonymiseringen.

De vigtigste kritiske fund er efterfølgende gentaget og **bekræftet ved kørsel** af projektets udvikler (markeret ✔︎).

**Begrænsninger:**

- Den rigtige Jev-model kunne ikke kaldes: miljøets netværk blokerer api.typesafe.ai, og der findes ingen API-nøgle.
- Kliniske vurderinger og retningslinjehenvisninger er faglige vurderinger. De er ikke ordrette citater og ikke verificeret mod kilderne.
- Juridiske vurderinger (MDR, AI-forordningen, GDPR) er ikke juridisk rådgivning.
- Der er ikke testet med rigtige brugere, skærmlæser eller journalsystem.

## Samlet konklusion

> **Programmet må ikke tages i klinisk brug i sin nuværende form.**

Fundamentet er sundt:

- ABCDE-screening først
- "højeste niveau vinder" og forsigtighed som princip
- 112 kan udløses med ét klik
- gennemsigtige begrundelser
- et Jev-lag, der kun kan hæve hastegraden

Men programmet kan give **under-triage uden at visitator opdager det**. I den kliniske validering lå **25 af 60 vignetter under forventet hastegrad**. Mindst 10 af dem er klinisk alvorlige, fx barn i kemoterapi med feber → blå, og hovedtraume i NOAK-behandling → hvid. Hertil kommer fejl i input og brugerflade, der kan ændre svar eller tal ubemærket.

Jev-integrationen er teknisk korrekt og godt afgrænset i beslutningsmotoren. Der mangler dog klinisk validering, kalibrering og et databeskyttelsesgrundlag, og brugerfladen lægger op til anchoring. Programmet er efter auditørernes vurdering **medicinsk udstyr (MDR, regel 11, sandsynligvis klasse IIb)**, og med Jev sandsynligvis et **højrisiko-AI-system** under AI-forordningen.

| Område | Kritisk | Høj | Middel | Lav |
|---|---|---|---|---|
| Klinisk indhold | 10 | 9 | 6 | 5 |
| UX | 4 | 7 | 9 | 6 |
| Jev / data / sikkerhed | 2 | 4 | 6 | 6 |

Flere fund er rapporteret af mere end én auditør. De er slået sammen nedenfor.

---

## 1. Kritiske fund – skal rettes før enhver klinisk afprøvning

### K1. "Ved ikke" tæller som "nej" i protokollerne ✔︎
*Rapporteret af: Klinik K2, UX K1*

- **Problem:** README lover, at "ved ikke" ved alarmsymptomer behandles som muligt alarmsymptom. Men ca. 210 regler bruger `ja()`, og kun ca. 6-10 bruger `jaEllerUkendt()`. Samtidig er "Ved ikke"-knappen orange og signalerer eskalering.
- **Eksempler:**
  - Tordenskraldshovedpine "ved ikke" → **grøn** ✔︎
  - Barn 8 mdr. med alle alarmspørgsmål "ved ikke" → **hvid**, "uden alarmsymptomer"
  - Stridor "ved ikke" → gul
  - Psykotisk "ved ikke" → grøn
- **Rettelse:**
  - Marker alarmspørgsmål (`alarm: true`) og lad motoren generelt behandle "ved ikke" på dem som mindst orange.
  - Tilføj en test, der håndhæver det for alle protokoller.

### K2. Risikogrupper løfter kun ét niveau (maks. gul), og kemo/immunsuppression findes kun i "Feber (voksen)" ✔︎
*Rapporteret af: Klinik K1, H2*

- **Eksempler:**
  - Barn i kemo med feber 38,6 → **blå** ✔︎
  - Kemopatient med opkast/diarré → blå
  - Immunsupprimeret med halsbetændelse og feber (agranulocytose) → blå
  - 90-årig skrøbelig med feber → blå
  - 78-årig med mavesmerter → grøn
- **Rettelse:**
  - Global regel: kemo/immunsuppression + feber eller "føler sig syg" → mindst orange med onkologisk/hæmatologisk rute.
  - Brug gulve (minimumsniveauer) frem for "+1". Fx skrøbelig/≥ 75 år med feber eller mavesmerter → mindst gul.
  - Tilføj spørgsmål om agranulocytose-risikolægemidler.

### K3. Alder er ikke obligatorisk – uden alder slås børne- og graviditetslogik fra ✔︎
*Rapporteret af: Klinik K3, UX K3*

- **Problem:**
  - Et spædbarn med feber uden angivet alder → **hvid**, markeret som komplet.
  - En kvinde uden alder får ikke spørgsmålene om ektopisk graviditet og præeklampsi.
- **Rettelse:**
  - Alder (år/mdr.) skal være obligatorisk og tælle med i "mangler".
  - Ukendt alder eller køn skal give de mest forsigtige standardværdier.

### K4. Talfelter: decimalkomma ødelægger værdien ✔︎
*Rapporteret af: UX K2*

- **Problem:**
  - "39,5" gemmes som **395 °C** i journalen ✔︎.
  - Blodsukker "1,5" bliver til 15 mmol/l og giver **blå** i stedet for orange.
  - Grænserne (min/max) håndhæves ikke.
- **Rettelse:** Brug `type="text" inputmode="decimal"` med egen parsing af både komma og punktum, synlig fejl ved urealistiske værdier og visning af den fortolkede værdi.

### K5. Piletaster ændrer svar ubemærket – kan udløse eller fjerne 112 ✔︎
*Rapporteret af: UX K4*

- **Problem:** Efter et museklik har den skjulte radioknap fokus. Pil-op/ned skifter så svaret, fx "Nej" → "Ja" → **RØD / 112** ✔︎, og kan også skifte den anden vej.
- **Rettelse:**
  - Byg knapsegmenter, der kun reagerer på Space/Enter, eller fjern fokus efter museklik.
  - Log ændringer af screeningssvar i journalen.

### K6. Hovedtraume hos antikoagulerede fanges kun, hvis risikofaktoren er afkrydset ✔︎
*Rapporteret af: Klinik K4*

- **Problem:** En 80-årig i NOAK-behandling med hovedtraume, hvor risikofaktoren ikke er afkrydset → **hvid** ✔︎.
- **Rettelse:**
  - Spørg altid om blodfortyndende/trombocythæmmende medicin ved hovedtraume.
  - Tilføj reglerne ≥ 65 år + hovedtraume og < 1 år + hovedtraume.

### K7. Manglende eller ufuldstændige røde flag
*Rapporteret af: Klinik K5–K10, H1*

| Tilstand | Motor i dag | Forventet | Rettelse |
|---|---|---|---|
| Første krampeanfald, nu vågen | grøn | orange | Ny protokol "Kramper/bevidsthedstab" |
| Anafylaksi: hud + mave-tarm efter stik/fødevare | orange | rød | Brug WAO/EAACI-kriterier. Instruks ved rød: brug adrenalinpen, læg patienten ned |
| Igangværende "ikke-trykkende" brystsmerter, 58 år, diabetes | gul | orange/rød | Atypisk AKS, spørg om aortadissektion |
| Hjertebanken i går med brystsmerter/åndenød | grøn | orange | Tidsvindue 24 t |
| Dobbeltsidig benhævelse + åndenød/brystsmerter | grøn | orange | Uafhængig af side |
| Sepsis hos voksen (≥ 2 tegn) | orange | rød | Rød ved ≥ 2 tegn / marmorering / ny forvirring |
| Postpartum feber / psykose | hvid / grøn | gul / orange | Postpartum-protokol eller -afkrydsning |
| Knapcellebatteri hos barn | gul, "book tid" | orange/rød | Særskilt spørgsmål, handling "Ring Giftlinjen nu" |
| Nydebuteret type 1-diabetes hos barn | blå | gul/orange | Spørgsmål om tørst, polyuri og vægttab |

### K8. Helbredsoplysninger kan sendes til tredjepart uden teknisk spærre, og anonymiseringen er utilstrækkelig ✔︎
*Rapporteret af: Jev K2*

- **Problem:**
  - Rigtig Jev aktiveres alene af en API-nøgle.
  - Rensningen fanger ikke CPR skrevet `01.02.03-1234` eller med tankestreg ✔︎, navne, adresser ✔︎, fødselsdatoer eller `0045`-numre.
  - Rensningen fjerner derimod kliniske tal ("saturation 92 93 94 95").
- **Rettelse:**
  - Hård spærre: rigtig Jev kan kun startes med dokumenteret databehandleraftale, DPIA og overførselsgrundlag (fx `JEV_DBA_GODKENDT`).
  - Bredere rensning, eller afvis tekst med identifikatorer.
  - Test mod et korpus af danske formater.

### K9. Jev mangler klinisk validering og kalibrering
*Rapporteret af: Jev K1*

- **Problem:**
  - Tærsklerne (0,75 / 0,5 / 0,3) er overtaget fra et kundeservice-eksempel.
  - Referencedemoen viser `confidence = 1.0` selv på tvetydig tekst. Sikkerhedsgrænsen udløses altså sjældent.
  - Prompten "vælg ved tvivl den mest hastende" forvrider kalibreringen.
- **Rettelse:**
  - Retrospektiv validering på annoterede danske opkald (sensitivitet for rød/orange, subgrupper).
  - Lokal kalibrering.
  - Silent-mode-pilot, før output vises for visitatorer.

---

## 2. Høje fund

| # | Fund | Kilde | Rettelse |
|---|---|---|---|
| H1 | **Anchoring/automation bias:** Jev-panelet og et foreløbigt niveau ("Hvid – egenomsorg") vises, før ABCDE er stillet. Mærket "Jev 90 %" ved screeningsspørgsmål kan læses som klinisk sandsynlighed, og manglende mærke som "tjekket". Protokolforslaget kan indirekte sænke niveauet (fx `administrativt` omgår risikogruppe-løft). | Jev H2, UX H2/H3/H6 | Vis intet niveau før screeningen. Jev først efter ABCDE. Mærket omdøbes til "Nævnt i teksten – spørg alligevel". Skjul "Jev vurderer lavere". Advar ved `administrativt` + kliniske ord. |
| H2 | **`Score.score` er en forventet værdi og afrundes**, så halerisiko skjules. 75 % hvid / 25 % rød giver ingen løft og teksten "Jev vurderer lavere". | Jev H1 | Brug fordelingen: P(rød) ≥ t1 → samme sti som livstruende, P(≥ orange) ≥ t2 → orange. `max(livstruende, P(rød))`. |
| H3 | **Den simulerede Jev giver farlige output:** negationsfiltret gør "Hun kan ikke få luft" → **hvid** ✔︎. Journalen markerer ikke simulering. | Jev H3 | Ret negationen, eller gulv på gul / livstruende ≥ 0,5. Tydeligt SIMULERET-banner og -mærkning i journalen. Kræv dev-flag. |
| H4 | **Modelversion ikke fastlåst** (`jev-latest`), og SDK'et er uden øvre versionsgrænse. | Jev H4 | Fastlås model og SDK. Afvis svar fra en ikke-godkendt model. Revalidér ved versionsskift. |
| H5 | **Journalnotatet påstår handlinger, der ikke er udført:** "Råd/sikkerhedsnet givet" skrives altid, og "Nej – lægen orienteret" skrives automatisk. | UX H1 | Afkrydsning pr. råd/sikkerhedsnet. Udfyld eksplicit "lægen orienteret kl./af". |
| H6 | **Graviditet:** protokollen genbruger ikke ugen fra patientdata. Når protokollen "Graviditet" tilføjes, sænkes niveauet (risikogruppe-løft bortfalder). | Klinik K9, UX H4 | Forudfyld uge. Behold minimumsniveauet. |
| H7 | **Forældet Jev-analyse** påvirker fortsat niveau og journal efter ændret tekst, fejl eller ændret patient. | Jev M2, UX H5 | Sæt Jev-bidraget på pause, indtil der er analyseret igen. |
| H8 | **Tilgængelighed:** 112-banneret har ingen `role="alert"`. Hele resultatpanelet (`aria-live`) gentegnes ved hvert tastetryk. Radiogrupper mangler navn. | UX H7 | `role="alert"`, separat live-region kun for niveauskift, `fieldset/legend`. |
| H9 | **Råd modsiger hastegraden:** paracetamol-råd til spædbarn (orange), "spis let kost" ved akut abdomen. Ingen instruks ved rød anafylaksi. | Klinik H9, K6 | Niveauafhængige råd. |
| H10 | **Klinik i øvrigt:** "ved ikke" i ABCDE giver kun orange (bør udløse "gå hen og se til patienten, ellers 112"); ansigtslammelse "inkl. pande" udelukker apopleksi; rygsmerter hos kræftpatient → grøn (MSCC); selvmordsvurdering ufuldstændig; orange uden for åbningstid = "ny kø hos 1813". | Klinik H3–H6, H8 | Se klinisk delrapport. Lokal instruks for varm overlevering. |
| H11 | **Protokolsøgning** matcher understrenge i begge retninger: "testikel" → Brystsmerter/Allergi, "bilulykke" → Allergi, "krampeanfald" → Skade. "Pung", "bevidstløs" og "meningitis" giver ingen træffere. | Klinik H7 | Match på hele ord/præfiks og flere søgeord. |

## 3. Middel og lave fund (udvalg)

**Jev og sikkerhed**
- Fail-open ved manglende eller ugyldige Jev-værdier: manglende sikkerhed tolkes som 1, og NaN accepteres.
- Ufangede fejl (`AttributeError`, `UnicodeDecodeError`).
- **CSRF / DNS-rebinding:** fremmede hjemmesider kan kalde `/api/jev/vurder` med `text/plain` og bruge praksis' API-nøgle og kvote ✔︎.
- Ingen timeouts: kaldet kan hænge i over 30 s med SDK'ets retries.
- Slowloris-sårbar server.
- Debug-logning skriver helbredsdata i loggen.
- Ingen Noul for manipulation/prompt injection.

**UX**
- Kontrast under AA: hvid på orange 3,56:1, på grøn 3,30:1. "FORELØBIG" ned til 2,5:1.
- Ubesvarede spørgsmål adskilles kun af en svag farvenuance.
- Modstridende "10 mangler" ved 112, og 112-instruksen er tvetydig om, hvem der ringer.
- Journaltidspunktet ændrer sig hvert minut i stedet for at vise opkaldstidspunktet.
- Data tabes ved genindlæsning.
- Kønsskift fjerner graviditet stille.
- Resultatet ligger nederst på mobil.
- Pårørende og tilbagekaldsnummer mangler.

**Klinik**
- KOL-tærskler for iltmætning giver over-triage (målområde 88-92 %).
- Forkerte ruter: immunsupprimeret → "kræftafdeling"; blødning før uge 18 → fødeafdeling.
- Helligdage mangler i konfigurationen.
- Manglende protokoller: næseblod ved AK-behandling, blødning uden graviditet, spædbarn, fald hos ældre, hypotermi.
- Regionsnavn: det hedder "Lægevagten 1818" i Region Sjælland.

**Lav**
- Faglatin i begrundelser til sekretærer.
- Lange journalnotater.
- Små klikflader.
- Server-header og ingen CSP.
- `httpx2` mangler i requirements.
- Pladsholder-nøglen vises som "Jev aktiv".

## 4. Hvad der fungerer godt

- **Arkitektur:** ABCDE først, "højeste niveau vinder", og modifikatorer kan kun hæve.
- **112:** ét klik til rødt, pulserende banner, der respekterer reduced motion.
- **Hastegrader** vises altid med tekst og farve. Begrundelser er gennemsigtige og med kilde.
- **Journalnotat og planer:** automatisk journalnotat med tid, vurdering, plan og Jev-bidrag. Planer afhænger af åbningstid og region.
- **Jev er godt afgrænset i motoren:** kan kun hæve, højst til orange, 112 kræver bekræftet screening, løft kræver lægegodkendelse. Det er testet.
- **Teknik:** API-nøglen bliver på serveren, beskyttelsen mod path traversal holder, og SDK'et bruges korrekt (typede spørgsmål, ét parallelt kald, testet via mock-transport).
- **Kodekvalitet:** ingen afhængigheder i frontenden, konsekvent HTML-escaping og testdækning af motoren.

## 5. Anbefalet vej til klinisk brug

1. **Ret K1–K8 og H1–H11**, og gør de 60 vignetter til regressionstests.
2. **Klinisk review af protokollerne** ved et panel (almen medicin, pædiatri, obstetrik, psykiatri) med godkendelse af praksis' læger.
3. **Retrospektiv validering** mod rigtige opkald og lægens vurdering. Det primære mål er under-triage-raten for rød/orange.
4. **Jev:** databehandleraftale, DPIA og tredjelandsvurdering; fastlåst modelversion; lokal kalibrering; silent-mode-pilot. Jev vises først for visitatorer efter dokumenteret sensitivitet.
5. **Regulatorisk afklaring** med Lægemiddelstyrelsen (MDR-klassifikation, evt. undtagelse for egenfremstilling i art. 5, stk. 5) og AI-forordningen.
6. **Instruks for delegation** (autorisationslovens § 17):
   - hvilke hastegrader medhjælp selv må afslutte
   - oplæring
   - lægetilgængelighed
   - stikprøveaudit
7. **Pilotforløb** hvor lægen gennemgår alle visitationer, efterfulgt af løbende audit, hændelsesrapportering og versionsstyring af protokollerne.
