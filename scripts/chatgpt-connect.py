#!/usr/bin/env python3
"""Run on your own computer: loopback OAuth -> your CounselorBot over TLS.

Python 3.10+, standard library only. Credentials are kept in memory and never
printed or saved. The short-lived pairing code is read with getpass, not argv.
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
import urllib.request
import webbrowser

ISSUER = "https://auth.openai.com"
RESOURCE = "https://api.openai.com/v1"
SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise RuntimeError("Redirect refused.")


def request_json(url, *, token=None, data=None, form=False):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    body = None
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
        body = (urllib.parse.urlencode(data) if form else json.dumps(data)).encode()
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(urllib.request.Request(url, data=body, headers=headers), timeout=30) as response:
        result = json.loads(response.read(200000))
        if not isinstance(result, dict):
            raise ValueError("Expected a JSON object.")
        return result


def server_origin(value):
    parsed = urllib.parse.urlsplit(value)
    if (parsed.username or parsed.password or parsed.query or parsed.fragment or
            parsed.path not in ("", "/") or not parsed.hostname or
            (parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}))):
        raise ValueError("Use HTTPS or a localhost tunnel, without a URL path.")
    return value.rstrip("/")


def connect(origin, pairing_code, *, no_browser=False):
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
            self.wfile.write(b"Return to the terminal to finish connecting." if valid else b"Invalid callback.")

    with HTTPServer(("127.0.0.1", 0), Handler) as local:
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
            print(authorize)
        elif not webbrowser.open(authorize):
            raise RuntimeError("Browser unavailable. Retry with --no-browser.")
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True, help="CounselorBot origin (HTTPS or localhost tunnel)")
    parser.add_argument("--no-browser", action="store_true", help="Print the public sign-in URL instead of opening it")
    args = parser.parse_args()
    try:
        origin = server_origin(args.server)
        pairing_code = getpass.getpass("CounselorBot pairing code: ").strip()
        if not 30 <= len(pairing_code) <= 100:
            raise ValueError("Invalid pairing code.")
        connect(origin, pairing_code, no_browser=args.no_browser)
    except (OSError, ValueError, KeyError, RuntimeError):
        # Upstream bodies/errors can contain credentials. Do not print them.
        print("Connection failed. Check the server address and start a new link in CounselorBot.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
