#!/usr/bin/env python3
"""Run on your own computer: loopback OAuth -> your CounselorBot over TLS.

Python 3.10+, standard library only. Credentials are kept in memory and never
printed or saved. The short-lived pairing code is read interactively, not argv.
Use --hide-code for invisible input, or --no-browser --callback-port for SSH.
"""
import argparse
import base64
import getpass
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import secrets
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
import webbrowser

ISSUER = "https://auth.openai.com"
RESOURCE = "https://api.openai.com/v1"
SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"


class ConnectionFailure(RuntimeError):
    """Only fixed, safe messages may be shown; never provider response bodies."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ConnectionFailure("Il server rimanda al login Console invece di accettare il codice di associazione. Verifica il proxy del servizio.")


def request_json(url, *, token=None, data=None, form=False):
    headers = {"Accept": "application/json", "User-Agent": "Mozilla/5.0 CounselorBot-ChatGPT-Connect/1.0"}
    if token:
        headers["Authorization"] = "Bearer " + token
    body = None
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
        body = (urllib.parse.urlencode(data) if form else json.dumps(data)).encode()
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(urllib.request.Request(url, data=body, headers=headers), timeout=30) as response:
            result = json.loads(response.read(200000))
            if not isinstance(result, dict):
                raise ValueError("Expected a JSON object.")
            return result
    except urllib.error.HTTPError as error:
        code = None
        try:
            result = json.loads(error.read(200000))
            code = result.get("detail") if isinstance(result, dict) else None
        except (ValueError, OSError):
            pass
        safe = {
            "chatgpt.errors.linkExpired": "Il codice di associazione è scaduto o già usato. Premi Collega ChatGPT per crearne uno nuovo.",
            "chatgpt.errors.disabled": "Il collegamento ChatGPT è disattivato. Un amministratore può abilitarlo dall'app.",
            "chatgpt.errors.notConfigured": "Il server deve predisporre il collegamento ChatGPT. Contatta l'amministratore.",
            "chatgpt.errors.permission": "Il tuo account ChatGPT non ha autorizzato l'uso dei modelli in CounselorBot.",
            "chatgpt.errors.invalidCredentials": "OpenAI non ha verificato il collegamento. Avvia una nuova associazione.",
        }
        if isinstance(code, str) and code in safe:
            raise ConnectionFailure(safe[code]) from None
        if error.code == 403:
            raise ConnectionFailure("La richiesta è stata rifiutata dal servizio o dal proxy. Apri l'assistente grafico sul computer del browser.") from None
        raise ConnectionFailure("Il servizio non ha completato il collegamento. Avvia una nuova associazione e riprova.") from None


def server_origin(value):
    parsed = urllib.parse.urlsplit(value)
    if (parsed.username or parsed.password or parsed.query or parsed.fragment or
            parsed.path not in ("", "/") or not parsed.hostname or
            (parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}))):
        raise ValueError("Use HTTPS or a localhost tunnel, without a URL path.")
    return value.rstrip("/")


def connect(origin, pairing_code, *, no_browser=False, callback_port=0):
    parameters = request_json(origin + "/api/chatgpt/link/parameters", token=pairing_code)
    state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    callback = {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Never log a URL containing an authorization code.

        def do_GET(self):
            parsed = urllib.parse.urlsplit(self.path)
            values = urllib.parse.parse_qs(parsed.query)
            valid = parsed.path == "/auth/callback" and values.get("state") == [state]
            if valid:
                if "error" in values:
                    callback["error"] = True
                elif len(values.get("code", [])) == 1 and len(values.get("client_id", [])) <= 1:
                    issued = values.get("client_id", [parameters["client_id"]])[0]
                    expected = parameters["client_id"]
                    if issued != "dynamic_agent_client" and (expected == "dynamic_agent_client" or issued == expected):
                        callback.update(code=values["code"][0], client_id=issued)
                    else:
                        callback["error"] = True
                else:
                    callback["error"] = True
            self.send_response(200 if valid else 400)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Connection in progress. Return to CounselorBot when the helper confirms completion." if valid else b"Invalid callback.")

    try:
        listener = HTTPServer(("127.0.0.1", callback_port), Handler)
    except OSError:
        raise ConnectionFailure("La porta del callback è occupata o non disponibile. Scegli un'altra --callback-port e aggiorna il tunnel SSH con la stessa porta.") from None
    with listener as local:
        local.timeout = 1
        redirect_uri = f"http://127.0.0.1:{local.server_port}/auth/callback"
        query = dict(client_id=parameters["client_id"], ext_agent_host_id=parameters["host_id"],
                     response_type="code", redirect_uri=redirect_uri, scope=SCOPES, resource=RESOURCE,
                     state=state, nonce=parameters["nonce"], code_challenge=challenge, code_challenge_method="S256")
        if parameters["client_id"] == "dynamic_agent_client":
            query["agent_name_hint"] = parameters["agent_name"]
        authorize = ISSUER + "/api/accounts/authorize?" + urllib.parse.urlencode(query)
        print("Opening ChatGPT sign-in. Credentials will stay out of this terminal.")
        if no_browser:
            print(f"Callback locale: {redirect_uri}. Da SSH inoltra questa porta al computer del browser.", flush=True)
            print("Apri questo URL nel browser del tuo computer:", flush=True)
            print(authorize, flush=True)
        elif not webbrowser.open(authorize):
            raise ConnectionFailure("Il browser non è disponibile qui. Usa --no-browser --callback-port con un tunnel SSH, oppure esegui lo strumento sul computer del browser.")
        deadline = time.monotonic() + 600
        while not callback and time.monotonic() < deadline:
            local.handle_request()
    if not callback or callback.get("error"):
        raise RuntimeError("Sign-in cancelled or expired. Start a new link in CounselorBot.")
    # Retain an issued registration even if the one-time code exchange fails.
    # Only a subsequently verified grant can activate inference.
    request_json(origin + "/api/chatgpt/link/registration", token=pairing_code,
                 data={"client_id": callback["client_id"]})
    tokens = request_json(ISSUER + "/api/accounts/oauth/token", form=True, data={
        "grant_type": "authorization_code", "client_id": callback["client_id"], "code": callback["code"],
        "redirect_uri": redirect_uri, "code_verifier": verifier, "resource": RESOURCE})
    credentials = {key: tokens[key] for key in ("access_token", "refresh_token", "id_token", "token_type")}
    for optional in ("scope", "earliest_refresh_at"):
        if optional in tokens:
            credentials[optional] = tokens[optional]
    credentials["client_id"] = callback["client_id"]
    request_json(origin + "/api/chatgpt/link/complete", token=pairing_code, data=credentials)
    print("Connected. Return to CounselorBot, choose a model and enable your subscription.")


def port_number(value):
    try:
        port = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError("La porta callback deve essere un numero tra 0 e 65535.") from None
    if not 0 <= port <= 65535:
        raise argparse.ArgumentTypeError("La porta callback deve essere tra 0 e 65535.")
    return port


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True, help="CounselorBot origin (HTTPS or localhost tunnel)")
    parser.add_argument("--no-browser", action="store_true", help="Print the public sign-in URL instead of opening it")
    parser.add_argument("--callback-port", type=port_number, default=0, help="Loopback callback port (0: automatic; use a fixed port with SSH -L)")
    parser.add_argument("--hide-code", action="store_true", help="Hide the pairing code while pasting it; press Enter to submit")
    args = parser.parse_args()
    try:
        origin = server_origin(args.server)
        print("Incolla il codice di associazione generato da CounselorBot, non un token o una chiave OpenAI. Poi premi Invio.", flush=True)
        read_code = getpass.getpass if args.hide_code else input
        prompt = "Codice di associazione (incolla invisibile): " if args.hide_code else "Codice di associazione (visibile): "
        pairing_code = read_code(prompt).strip()
        if not 30 <= len(pairing_code) <= 100:
            raise ConnectionFailure("Copia tutto il codice di associazione mostrato in CounselorBot. Non inserire un token o una chiave API OpenAI.")
        print(f"Codice ricevuto ({len(pairing_code)} caratteri). Avvio il collegamento…", flush=True)
        connect(origin, pairing_code, no_browser=args.no_browser, callback_port=args.callback_port)
    except EOFError:
        print("Nessun codice ricevuto. Incolla il codice al prompt e premi Invio.", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Collegamento annullato.", file=sys.stderr)
        return 1
    except ConnectionFailure as failure:
        print(str(failure), file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError, RuntimeError):
        # Upstream bodies/errors can contain credentials. Do not print them.
        print("Connection failed. Check the server address and start a new link in CounselorBot.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
