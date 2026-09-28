"""Tests af Jev-integrationen. Bruger den rigtige typesafe_sdk-klient med mock-transport."""

import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import httpx2
from typesafe_sdk import TypeSafeClient

from jev.server import lav_handler
from jev.simuleret import simuleret_klient
from jev.vurdering import Katalog, UgyldigForespoergsel, byg_spoergsmaal, fjern_personhenfoerbart, valider, vurder

KATALOG = Katalog.indlaes()


def fast_klient(answers, capture=None):
    """Klient der returnerer faste Jev-svar og gemmer den afsendte forespørgsel."""

    def handler(request):
        if capture is not None:
            capture.append(json.loads(request.content))
        return httpx2.Response(200, json={"model": "jev-1.13.0", "usage": {"input_tokens": 10, "output_tokens": 5}, "answers": answers})

    return TypeSafeClient(api_key="test", transport=httpx2.MockTransport(handler))


def standardsvar(**overrides):
    answers = {
        "kontaktaarsag": {
            "type": "choice",
            "choice": "brystsmerter",
            "confidence": 0.7,
            "probabilities": {"brystsmerter": 0.7, "aandenoed": 0.2, "andet": 0.1},
        },
        "hastegrad": {
            "type": "score",
            "score": 4.3,
            "confidence": 0.9,
            "legend": {str(i): str(i) for i in range(6)},
            "probabilities": {"0": 0, "1": 0, "2": 0, "3": 0.1, "4": 0.5, "5": 0.4},
        },
        "livstruende": {"type": "noul", "noul": 0.6},
        "uklar": {"type": "noul", "noul": 0.05},
    }
    for s in KATALOG.screening:
        answers[f"screening__{s['id']}"] = {"type": "noul", "noul": 0.02}
    answers.update(overrides)
    return answers


class TestKatalog(unittest.TestCase):
    def test_katalog_er_opdateret(self):
        # Katalogen skal genereres fra JS-protokollerne (npm run jev:katalog).
        protokol_filer = (Path(__file__).parent.parent / "src" / "protocols").glob("*.js")
        ids = {p["id"] for p in KATALOG.protokoller}
        tekst = "".join(f.read_text(encoding="utf-8") for f in protokol_filer)
        for pid in ids:
            self.assertIn(f"id: '{pid}'", tekst)
        self.assertEqual(len(KATALOG.hastegrader), 6)

    def test_spoergsmaal(self):
        q = byg_spoergsmaal(KATALOG)
        self.assertEqual(q["kontaktaarsag"].type, "choice")
        self.assertEqual(set(q["kontaktaarsag"].criteria), {p["id"] for p in KATALOG.protokoller})
        self.assertEqual(len(q["hastegrad"].criteria), 6)
        self.assertEqual(sum(k.startswith("screening__") for k in q), len(KATALOG.screening))


class TestValidering(unittest.TestCase):
    def test_fjerner_personhenfoerbare_oplysninger(self):
        t = fjern_personhenfoerbart("CPR 010203-1234, tlf 12 34 56 78, mail a.b@c.dk, feber 39,5 i 3 dage")
        self.assertNotIn("1234", t)
        self.assertNotIn("56 78", t)
        self.assertNotIn("a.b@c.dk", t)
        self.assertIn("feber 39,5 i 3 dage", t)

    def test_ugyldige(self):
        for payload in [
            None,
            {},
            {"tekst": "  "},
            {"tekst": "x" * 3000},
            {"tekst": "hej", "alderAar": -1},
            {"tekst": "hej", "alderAar": True},
            {"tekst": "hej", "koen": "x"},
        ]:
            with self.assertRaises(UgyldigForespoergsel):
                valider(payload)

    def test_gyldig(self):
        self.assertEqual(valider({"tekst": " feber ", "alderAar": 3, "koen": "mand"}), ("feber", 3.0, "mand"))


class TestVurder(unittest.TestCase):
    def test_request_og_fortolkning(self):
        sendt = []
        r = vurder(
            fast_klient(standardsvar(), sendt), {"tekst": "trykken i brystet, cpr 0102031234", "alderAar": 60, "koen": "mand"}, KATALOG
        )
        body = sendt[0]
        self.assertEqual(body["state"]["alder_aar"], 60)
        self.assertNotIn("0102031234", json.dumps(body))
        self.assertEqual(body["questions"]["hastegrad"]["type"], "score")
        self.assertEqual(r["model"], "jev-1.13.0")
        self.assertEqual(r["hastegrad"]["niveau"], 4)
        self.assertAlmostEqual(r["hastegrad"]["pAkut"], 0.9)
        self.assertEqual([f["id"] for f in r["protokolForslag"]], ["brystsmerter", "aandenoed"])
        self.assertAlmostEqual(r["livstruende"], 0.6)
        self.assertEqual(len(r["screening"]), len(KATALOG.screening))

    def test_simuleret_klient(self):
        k = simuleret_klient()
        r = vurder(k, {"tekst": "Han har trykken for brystet og er klam", "alderAar": 64, "koen": "mand"}, KATALOG)
        self.assertEqual(r["model"], "jev-simuleret")
        self.assertGreaterEqual(r["hastegrad"]["niveau"], 4)
        self.assertGreater(r["screening"]["brystsmerter"], 0.5)
        self.assertEqual(r["protokolForslag"][0]["id"], "brystsmerter")
        r2 = vurder(k, {"tekst": "Jeg skal have fornyet min recept"}, KATALOG)
        self.assertEqual(r2["protokolForslag"][0]["id"], "administrativt")
        self.assertEqual(r2["hastegrad"]["niveau"], 1)


class TestServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), lav_handler(simuleret_klient(), "simuleret", KATALOG))
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def hent(self, sti, data=None):
        req = urllib.request.Request(self.base + sti, data=data, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            with e:
                return e.code, e.read()

    def test_status_og_statiske_filer(self):
        s, b = self.hent("/api/jev/status")
        self.assertEqual((s, json.loads(b)["simuleret"]), (200, True))
        self.assertEqual(self.hent("/")[0], 200)
        self.assertEqual(self.hent("/src/engine.js")[0], 200)
        for sti in ["/package.json", "/jev/server.py", "/src/../package.json", "/.env"]:
            self.assertEqual(self.hent(sti)[0], 404, sti)

    def test_vurder(self):
        s, b = self.hent("/api/jev/vurder", json.dumps({"tekst": "feber og hoste"}).encode())
        self.assertEqual(s, 200)
        self.assertIn("hastegrad", json.loads(b))
        s, b = self.hent("/api/jev/vurder", b"{ikke json")
        self.assertEqual(s, 400)
        s, b = self.hent("/api/jev/vurder", json.dumps({"tekst": ""}).encode())
        self.assertEqual(s, 400)

    def test_uden_noegle(self):
        srv = ThreadingHTTPServer(("127.0.0.1", 0), lav_handler(None, "ingen API-nøgle", KATALOG))
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{srv.server_address[1]}/api/jev/vurder", data=b'{"tekst":"x"}')
            with self.assertRaises(urllib.error.HTTPError) as cm:
                urllib.request.urlopen(req)
            self.assertEqual(cm.exception.code, 503)
            cm.exception.close()
        finally:
            srv.shutdown()


if __name__ == "__main__":
    unittest.main()
