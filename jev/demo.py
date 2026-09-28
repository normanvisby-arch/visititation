#!/usr/bin/env python3
"""Jev-demo: telefonvisitation af eksempelhenvendelser i ét parallelt kald pr. henvendelse.

python -m jev.demo              # rigtig Jev (kræver TYPESAFE_API_KEY)
python -m jev.demo --simuler    # simuleret Jev (ingen klinisk værdi)
"""

from __future__ import annotations

import argparse
import sys

from jev.server import lav_klient
from jev.vurdering import Katalog, vurder

EKSEMPLER = [
    {"tekst": "Min mand har haft trykken for brystet i 20 minutter og er klam og bleg", "alderAar": 64, "koen": "mand"},
    {"tekst": "Min datter på 2 år har haft feber i to dage, 39,2, drikker fint og leger", "alderAar": 2, "koen": "kvinde"},
    {"tekst": "Jeg skal have fornyet min recept på blodtrykspiller", "alderAar": 58, "koen": "kvinde"},
    {"tekst": "Svie når jeg tisser og skal tisse hele tiden, ingen feber", "alderAar": 31, "koen": "kvinde"},
    {"tekst": "Han taler sløret og mundvigen hænger i højre side siden for en halv time siden", "alderAar": 78, "koen": "mand"},
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--simuler", action="store_true")
    args = parser.parse_args()

    klient, tilstand = lav_klient(args.simuler)
    if klient is None:
        print(f"Jev er ikke aktiveret: {tilstand}. Brug --simuler for at afprøve uden nøgle.", file=sys.stderr)
        return 1
    katalog = Katalog.indlaes()
    titler = {p["id"]: p["titel"] for p in katalog.protokoller}
    farver = [h["farve"] for h in katalog.hastegrader]

    print(f"\nJev System One – telefonvisitation ({tilstand})\n")
    for i, eks in enumerate(EKSEMPLER, 1):
        r = vurder(klient, eks, katalog)
        h = r["hastegrad"]
        forslag = ", ".join(f"{titler.get(f['id'], f['id'])} {f['sandsynlighed']:.0%}" for f in r["protokolForslag"])
        alarmer = [k for k, p in r["screening"].items() if p >= 0.5]
        print(f'[{i}] "{eks["tekst"]}"')
        print(f"    Hastegrad: {farver[h['niveau']]} (score {h['score']:.1f}, sikkerhed {h['sikkerhed']:.0%}) | {r['latensMs']:.0f} ms")
        print(f"    Protokol:  {forslag}")
        print(f"    Livstruende: {r['livstruende']:.0%} | Alarmsymptomer: {', '.join(alarmer) or 'ingen'}\n")
    print("Jevs forslag er vejledende – den regelbaserede visitation og lægens vurdering afgør.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
