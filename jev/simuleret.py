"""Simuleret Jev til demonstration og test uden API-nøgle eller netværk.

Svarene laves af simple nøgleordsregler og har INGEN klinisk værdi. De sendes
gennem den rigtige ``typesafe_sdk``-klient via en mock-transport, så hele
kæden (forespørgsel → svarparsing → fortolkning) afprøves.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx2
from typesafe_sdk import TypeSafeClient

SIMULERET_MODEL = "jev-simuleret"

# Nøgleord pr. ABCDE-screeningsspørgsmål (skal matche id'er i src/screening.js).
SCREENING_NOEGLEORD = {
    "bevidsthed": ["bevidstløs", "vågner ikke", "reagerer ikke", "svær at vække"],
    "vejrtraekning": ["kan ikke få luft", "blå læber", "kan ikke tale", "kvæles"],
    "brystsmerter": ["trykken for brystet", "trykkende", "smerter i brystet", "ondt i brystet", "brystsmerter"],
    "bloedning": ["bløder voldsomt", "kraftig blødning", "stopper ikke med at bløde"],
    "kramper": ["kramper", "krampeanfald"],
    "apopleksi": ["skæv mund", "mundvigen hænger", "lammet", "lammelse", "talebesvær", "taler sløret", "sløret tale"],
    "anafylaksi": ["hævet i halsen", "hævelse i halsen", "hævede læber", "kan ikke synke"],
    "petekkier": ["prikker der ikke forsvinder", "glastest", "røde prikker"],
    "livsfare": ["selvmord", "tage mit liv", "tage sit liv", "slå sig selv ihjel"],
    "almenpaavirket": ["slap", "forvirret", "grå i huden", "meget syg", "klam"],
}

_HAST_NOEGLEORD = [
    (5, ["bevidstløs", "kan ikke få luft", "blå læber", "skæv mund", "mundvigen hænger", "taler sløret", "kramper nu"]),
    (4, ["trykken for brystet", "brystsmerter", "ondt i brystet", "selvmord", "lammelse", "kraftig blødning", "meget slap", "klam"]),
    (3, ["høj feber", "åndenød", "opkast", "stærke smerter", "blod i"]),
    (2, ["feber", "hoste", "udslæt", "svie", "tisse"]),
    (1, ["recept", "fornyelse", "attest", "prøvesvar"]),
]

_NEGATION = re.compile(r"\b(?:ingen|ikke|uden)\s+\w+")


def _indeholder(tekst: str, ord: list[str]) -> bool:
    return any(re.search(rf"\b{re.escape(o)}", tekst) for o in ord)


def _svar_paa(navn: str, spoergsmaal: dict[str, Any], tekst: str) -> dict[str, Any]:
    kind = spoergsmaal["type"]
    if kind == "noul":
        if navn.startswith("screening__"):
            p = 0.9 if _indeholder(tekst, SCREENING_NOEGLEORD.get(navn.removeprefix("screening__"), [])) else 0.03
        elif navn == "livstruende":
            p = 0.85 if _indeholder(tekst, _HAST_NOEGLEORD[0][1]) else 0.05
        elif navn == "uklar":
            p = 0.8 if len(tekst.split()) < 3 else 0.1
        else:
            p = 0.5
        return {"type": "noul", "noul": p}

    if kind == "choice":
        labels = list(spoergsmaal["criteria"])
        point = {}
        for label, beskrivelse in spoergsmaal["criteria"].items():
            ord = {w.strip(" ,()/").lower() for w in str(beskrivelse).replace("fx", "").split()}
            point[label] = sum(1 for w in ord if len(w) >= 4 and _indeholder(tekst, [w]))
        bedste = max(labels, key=lambda lbl: point[lbl])
        if point[bedste] == 0:
            bedste = "andet" if "andet" in labels else labels[-1]
        total = sum(point.values()) or 1
        probs = {lbl: (point[lbl] / total if sum(point.values()) else (1.0 if lbl == bedste else 0.0)) for lbl in labels}
        return {"type": "choice", "choice": bedste, "confidence": probs[bedste], "probabilities": probs}

    # score
    n = len(spoergsmaal["criteria"])
    niveau = next((lvl for lvl, ord in _HAST_NOEGLEORD if _indeholder(tekst, ord)), 0)
    niveau = min(niveau, n - 1)
    probs = {str(i): (0.8 if i == niveau else 0.2 / (n - 1)) for i in range(n)}
    return {
        "type": "score",
        "score": float(niveau),
        "confidence": 0.8,
        "legend": {str(i): str(c) for i, c in enumerate(spoergsmaal["criteria"])},
        "probabilities": probs,
    }


def _haandter(request: httpx2.Request) -> httpx2.Response:
    body = json.loads(request.content)
    state = body.get("state")
    tekst = json.dumps(state, ensure_ascii=False).lower() if not isinstance(state, str) else state.lower()
    tekst = _NEGATION.sub(" ", tekst)  # "ingen feber" tæller ikke som feber
    answers = {navn: _svar_paa(navn, q, tekst) for navn, q in body["questions"].items()}
    return httpx2.Response(
        200,
        json={"model": SIMULERET_MODEL, "usage": {"input_tokens": len(tekst.split()), "output_tokens": len(answers)}, "answers": answers},
    )


def simuleret_klient() -> TypeSafeClient:
    """En rigtig TypeSafeClient, hvis HTTP-kald besvares lokalt af nøgleordsregler."""
    return TypeSafeClient(api_key="simuleret", transport=httpx2.MockTransport(_haandter))
