#!/usr/bin/env python3
"""
Server local pentru 4chan Gallery.

De ce e nevoie de el: a.4cdn.org trimite
    access-control-allow-origin: http://boards.4chan.org
deci browserul NU lasa pagina noastra sa citeasca JSON-ul thread-ului direct.
Serverul face acel request in locul browserului (proxy) si serveste pagina.

Pozele si video-urile se incarca direct de pe i.4cdn.org in <img>/<video>,
fara proxy - CDN-ul nu are hotlink protection si suporta Range (seek in video).

Rulare:
    python serve.py            # port 8777
    python serve.py 9000       # alt port

Apoi deschide http://localhost:8777 (sau adresa LAN afisata, de pe telefon).
"""

import http.server
import json
import os
import re
import socket
import socketserver
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8777

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

BOARD_RE = re.compile(r"^[a-zA-Z0-9]{1,10}$")
TIM_RE = re.compile(r"^\d{5,25}$")
EXT_RE = re.compile(r"^\.(jpg|jpeg|png|gif|webm|mp4)$", re.I)


def fetch(url, timeout=20, rng=None):
    # Referer-ul e obligatoriu: i.4cdn.org da 403 pe fisierele full-size
    # daca vine de pe alt origin (thumbnail-urile sunt scutite).
    headers = {
        "User-Agent": UA,
        "Accept": "*/*",
        "Referer": "https://boards.4chan.org/",
    }
    if rng:
        headers["Range"] = rng
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=headers), timeout=timeout)


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    # linisteste logul: doar erorile conteaza
    def log_message(self, fmt, *args):
        if not str(args[0] if args else "").startswith(("GET /api", "GET /favicon")):
            sys.stderr.write("  %s\n" % (fmt % args))

    def fail(self, code, msg):
        body = json.dumps({"error": msg}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError):
            pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/api/thread":
            return self.api_thread(q)
        if parsed.path == "/api/file":
            return self.api_file(q)

        if parsed.path in ("/", ""):
            self.path = "/index.html"
        return super().do_GET()

    def api_thread(self, q):
        board = (q.get("board") or [""])[0]
        thread = (q.get("thread") or [""])[0]
        if not BOARD_RE.match(board) or not thread.isdigit():
            return self.fail(400, "board sau thread invalid")

        url = "https://a.4cdn.org/%s/thread/%s.json" % (board, thread)
        try:
            with fetch(url) as r:
                data = r.read()
        except urllib.error.HTTPError as e:
            return self.fail(e.code, "404 - thread inexistent sau arhivat"
                             if e.code == 404 else "4chan a raspuns %s" % e.code)
        except Exception as e:
            return self.fail(502, "nu am putut contacta 4chan: %s" % e)

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionAbortedError):
            pass

    def api_file(self, q):
        board = (q.get("board") or [""])[0]
        tim = (q.get("tim") or [""])[0]
        ext = (q.get("ext") or [""])[0]
        name = (q.get("name") or [""])[0] or (tim + ext)
        if not (BOARD_RE.match(board) and TIM_RE.match(tim) and EXT_RE.match(ext)):
            return self.fail(400, "parametri invalizi")

        inline = (q.get("inline") or [""])[0] == "1"
        url = "https://i.4cdn.org/%s/%s%s" % (board, tim, ext)
        rng = self.headers.get("Range")

        try:
            up = fetch(url, timeout=60, rng=rng)
        except urllib.error.HTTPError as e:
            return self.fail(e.code, "fisierul nu mai exista pe server")
        except Exception as e:
            return self.fail(502, "eroare la descarcare: %s" % e)

        safe = re.sub(r'[\\/:*?"<>|\r\n]+', "_", name)[:120]
        length = up.headers.get("Content-Length")
        crange = up.headers.get("Content-Range")

        self.send_response(206 if crange else 200)
        self.send_header("Content-Type", up.headers.get("Content-Type", "application/octet-stream"))
        self.send_header("Accept-Ranges", "bytes")
        if crange:
            self.send_header("Content-Range", crange)
        if length:
            self.send_header("Content-Length", length)
        else:
            self.send_header("Connection", "close")
        self.send_header("Content-Disposition",
                         ('inline' if inline else 'attachment; filename="%s"' % safe))
        self.end_headers()

        try:
            while True:
                chunk = up.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionAbortedError):
            pass
        finally:
            up.close()


class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    # Pe Windows SO_REUSEADDR lasa doua procese sa asculte pe acelasi port si
    # cererile ajung aleator la cel vechi. Mai bine dam eroare clara de port ocupat.
    allow_reuse_address = (os.name != "nt")


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return None
    finally:
        s.close()


if __name__ == "__main__":
    ip = lan_ip()
    print("")
    print("  4chan Gallery")
    print("  ---------------------------------------------")
    print("  PC:       http://localhost:%d" % PORT)
    if ip:
        print("  Telefon:  http://%s:%d   (aceeasi reteaua Wi-Fi)" % (ip, PORT))
    print("  ---------------------------------------------")
    print("  Ctrl+C pentru oprire")
    print("")
    try:
        Server(("0.0.0.0", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\n  Oprit.")
    except OSError as e:
        print("  Nu am putut porni pe portul %d: %s" % (PORT, e))
        print("  Incearca: python serve.py 9000")
