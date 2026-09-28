"""Webserver med Jev-integration.

Serverer brugerfladen og et lokalt API, som brugerfladen kalder:

    GET  /api/jev/status   → om Jev er aktiv, og om den er simuleret
    POST /api/jev/vurder   → {tekst, alderAar, koen} → Jev-forslag

Start:
    python -m jev.server              # rigtig Jev (kræver TYPESAFE_API_KEY)
    python -m jev.server --simuler    # simuleret Jev til demonstration

API-nøglen forlader aldrig serveren. Kun kontaktårsagen (renset for CPR-,
telefonnumre og e-mail), alder og køn sendes til TypeSafe AI.
"""

from __future__ import annotations

import argparse
import json
import logging
import mimetypes
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from typesafe_sdk import TypeSafeError

from jev.vurdering import Katalog, UgyldigForespoergsel, vurder

ROD = Path(__file__).resolve().parent.parent
TILLADTE = ("index.html", "app/", "src/")
MAKS_BODY = 64 * 1024

log = logging.getLogger("jev.server")


def lav_klient(simuler: bool) -> tuple[Any | None, str]:
    if simuler:
        from jev.simuleret import simuleret_klient

        return simuleret_klient(), "simuleret"
    try:
        from dotenv import load_dotenv

        load_dotenv(ROD / ".env")
    except ImportError:
        pass
    if not os.environ.get("TYPESAFE_API_KEY", "").strip():
        return None, "ingen API-nøgle (TYPESAFE_API_KEY)"
    from typesafe_sdk import TypeSafeClient

    return TypeSafeClient(), "aktiv"


def lav_handler(klient: Any | None, tilstand: str, katalog: Katalog) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        server_version = "Telefonvisitation"

        def log_message(self, fmt: str, *args: Any) -> None:  # undgå at logge forespørgselsindhold
            log.info("%s %s", self.command, self.path.split("?")[0])

        def _json(self, status: int, data: dict[str, Any]) -> None:
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            sti = self.path.split("?")[0]
            if sti == "/api/jev/status":
                return self._json(200, {"aktiv": klient is not None, "simuleret": tilstand == "simuleret", "tilstand": tilstand})
            fil = (ROD / ("index.html" if sti == "/" else sti.lstrip("/"))).resolve()
            rel = fil.relative_to(ROD).as_posix() if fil.is_relative_to(ROD) else ""
            if not any(rel == t or rel.startswith(t) for t in TILLADTE) or not fil.is_file():
                self.send_error(HTTPStatus.NOT_FOUND, "Ikke fundet")
                return
            data = fil.read_bytes()
            ctype = mimetypes.guess_type(fil.name)[0] or "application/octet-stream"
            if ctype.startswith("text/") or ctype.endswith("javascript"):
                ctype += "; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self) -> None:
            if self.path.split("?")[0] != "/api/jev/vurder":
                return self._json(404, {"fejl": "Ikke fundet"})
            if klient is None:
                return self._json(503, {"fejl": f"Jev er ikke aktiveret: {tilstand}."})
            try:
                laengde = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                laengde = -1
            if not 0 < laengde <= MAKS_BODY:
                return self._json(413 if laengde > MAKS_BODY else 400, {"fejl": "Ugyldig forespørgsel."})
            try:
                payload = json.loads(self.rfile.read(laengde))
                return self._json(200, vurder(klient, payload, katalog))
            except (UgyldigForespoergsel, json.JSONDecodeError) as fejl:
                return self._json(400, {"fejl": str(fejl) or "Ugyldig JSON."})
            except (TypeSafeError, KeyError) as fejl:  # netværk, nøgle, rate limit, uventet svar
                log.warning("Jev-kald fejlede: %s", type(fejl).__name__)
                return self._json(502, {"fejl": f"Jev kunne ikke svare ({type(fejl).__name__}). Visitér efter protokollen."})

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description="Telefonvisitation med Jev (TypeSafe AI)")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    parser.add_argument("--simuler", action="store_true", help="brug simuleret Jev (ingen API-nøgle, ingen klinisk værdi)")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    klient, tilstand = lav_klient(args.simuler)
    server = ThreadingHTTPServer((args.host, args.port), lav_handler(klient, tilstand, Katalog.indlaes()))
    print(f"Telefonvisitation kører på http://{args.host}:{args.port} – Jev: {tilstand}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
