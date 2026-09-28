"""Jev (TypeSafe AI, System One) som hurtigt beslutningslag i telefonvisitationen.

Indringers fritekst evalueres i ét parallelt Jev-kald med typede spørgsmål:

- ``kontaktaarsag`` (Choice): hvilken symptomprotokol passer bedst
- ``hastegrad``     (Score):  hastegrad på skalaen hvid → rød
- ``livstruende``   (Noul):   mulig livstruende tilstand (112)
- ``uklar``         (Noul):   henvendelsen er for uklar til at vurdere
- ``screening__<id>`` (Noul): nævnes de enkelte ABCDE-alarmsymptomer

Jevs svar er *forslag*. Den regelbaserede motor (src/engine.js) afgør hastegraden;
Jev kan kun hæve den eller kræve lægegodkendelse – aldrig sænke den.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from typesafe_sdk import Choice, Noul, Score

KATALOG_STI = Path(__file__).with_name("katalog.json")

MAKS_TEKSTLAENGDE = 2000
PROTOKOL_TAERSKEL = 0.15  # mindste sandsynlighed for at et protokolforslag vises
MAKS_PROTOKOLFORSLAG = 3

_CPR = re.compile(r"\b\d{6}[-\s]?\d{4}\b")
_TELEFON = re.compile(r"(?<!\d)(?:\+45[\s-]?)?(?:\d{2}[\s-]?){3}\d{2}(?!\d)")
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")


class UgyldigForespoergsel(ValueError):
    """Forespørgslen til Jev er ugyldig."""


@dataclass(frozen=True)
class Katalog:
    protokoller: list[dict[str, Any]]
    screening: list[dict[str, Any]]
    hastegrader: list[dict[str, Any]]

    @classmethod
    def indlaes(cls, sti: Path = KATALOG_STI) -> Katalog:
        data = json.loads(sti.read_text(encoding="utf-8"))
        return cls(data["protokoller"], data["screening"], data["hastegrader"])


def fjern_personhenfoerbart(tekst: str) -> str:
    """Fjerner CPR-numre, telefonnumre og e-mailadresser, før teksten sendes til Jev."""
    tekst = _CPR.sub("[CPR fjernet]", tekst)
    tekst = _EMAIL.sub("[e-mail fjernet]", tekst)
    return _TELEFON.sub("[nummer fjernet]", tekst)


def byg_spoergsmaal(katalog: Katalog) -> dict[str, Any]:
    """Bygger Jev-spørgsmålene ud fra protokol- og screeningskataloget."""
    spoergsmaal: dict[str, Any] = {
        "kontaktaarsag": Choice(
            instructions="Hvilken symptomprotokol til telefonvisitation i dansk almen praksis passer bedst til henvendelsen?",
            criteria={p["id"]: f"{p['titel']} (fx {', '.join(p['soegeord'])})" for p in katalog.protokoller},
        ),
        "hastegrad": Score(
            instructions=(
                "Vurdér efter dansk telefonvisitation i almen praksis, hvor hurtigt patienten skal vurderes. "
                "Vælg ved tvivl den mest hastende relevante kategori."
            ),
            criteria=[f"{h['titel']}: {h['beskrivelse']}" for h in katalog.hastegrader],
        ),
        "livstruende": Noul(
            instructions="Beskriver henvendelsen symptomer, der kan være umiddelbart livstruende og kræver, at der ringes 112?",
        ),
        "uklar": Noul(
            instructions="Er henvendelsen for uklar eller mangelfuld til, at hastegraden kan vurderes sikkert?",
        ),
    }
    for s in katalog.screening:
        spoergsmaal[f"screening__{s['id']}"] = Noul(
            instructions=f"Oplyser henvendelsen, at følgende er til stede hos patienten: {s['tekst']}",
        )
    return spoergsmaal


def byg_state(tekst: str, alder_aar: float | None, koen: str | None) -> dict[str, Any]:
    state: dict[str, Any] = {"henvendelse": tekst}
    if alder_aar is not None:
        state["alder_aar"] = round(alder_aar, 2)
    if koen:
        state["koen"] = koen
    return state


def valider(payload: Any) -> tuple[str, float | None, str | None]:
    """Validerer og renser en forespørgsel fra brugerfladen."""
    if not isinstance(payload, dict):
        raise UgyldigForespoergsel("Forespørgslen skal være et JSON-objekt.")
    tekst = payload.get("tekst")
    if not isinstance(tekst, str) or not tekst.strip():
        raise UgyldigForespoergsel("Skriv kontaktårsagen med indringers egne ord først.")
    tekst = tekst.strip()
    if len(tekst) > MAKS_TEKSTLAENGDE:
        raise UgyldigForespoergsel(f"Teksten må højst være {MAKS_TEKSTLAENGDE} tegn.")
    alder = payload.get("alderAar")
    if alder is not None and (not isinstance(alder, (int, float)) or isinstance(alder, bool) or not 0 <= alder <= 130):
        raise UgyldigForespoergsel("Ugyldig alder.")
    koen = payload.get("koen")
    if koen is not None and koen not in {"kvinde", "mand", "andet"}:
        raise UgyldigForespoergsel("Ugyldigt køn.")
    return fjern_personhenfoerbart(tekst), (float(alder) if alder is not None else None), koen


def fortolk(svar: Any, katalog: Katalog) -> dict[str, Any]:
    """Omsætter et SystemOneResponse til et JSON-venligt forslag til brugerfladen."""
    a = svar.answers
    kontakt = a["kontaktaarsag"]
    forslag = sorted(
        ({"id": pid, "sandsynlighed": float(p)} for pid, p in kontakt.probabilities.items() if p >= PROTOKOL_TAERSKEL),
        key=lambda f: f["sandsynlighed"],
        reverse=True,
    )[:MAKS_PROTOKOLFORSLAG]
    if not forslag:
        forslag = [{"id": kontakt.choice, "sandsynlighed": float(kontakt.confidence)}]

    hast = a["hastegrad"]
    maks = len(katalog.hastegrader) - 1
    fordeling = {int(k): float(v) for k, v in hast.probabilities.items()}
    return {
        "model": svar.model,
        "protokolForslag": forslag,
        "protokolSikkerhed": float(kontakt.confidence),
        "hastegrad": {
            "score": float(hast.score),
            "niveau": max(0, min(maks, round(float(hast.score)))),
            "sikkerhed": float(hast.confidence),
            # Sandsynlighed for mindst orange (akut) – bruges som ekstra sikkerhedsnet.
            "pAkut": sum(p for k, p in fordeling.items() if k >= 4),
            "fordeling": fordeling,
        },
        "livstruende": float(a["livstruende"].noul),
        "uklar": float(a["uklar"].noul),
        "screening": {s["id"]: float(a[f"screening__{s['id']}"].noul) for s in katalog.screening if f"screening__{s['id']}" in a},
    }


def vurder(client: Any, payload: Any, katalog: Katalog | None = None) -> dict[str, Any]:
    """Validerer, kalder Jev i ét parallelt kald og returnerer fortolkede forslag."""
    katalog = katalog or Katalog.indlaes()
    tekst, alder, koen = valider(payload)
    start = time.perf_counter()
    svar = client.system_one(state=byg_state(tekst, alder, koen), questions=byg_spoergsmaal(katalog))
    resultat = fortolk(svar, katalog)
    resultat["latensMs"] = round((time.perf_counter() - start) * 1000, 1)
    resultat["sendtTekst"] = tekst
    return resultat
