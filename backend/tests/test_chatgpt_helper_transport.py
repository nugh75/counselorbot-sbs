"""Real loopback HTTP checks for the tracked helper; no provider, SSO or DB access."""
from contextlib import contextmanager, redirect_stderr, redirect_stdout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
from pathlib import Path
import socket
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.parse
import urllib.request


PAIRING = "fixture-pairing-code-0000000000000000000000"
PRIVATE_RESPONSE = "PRIVATE-FIXTURE-RESPONSE-NEVER-DISPLAY"


def load_helper():
    # The repository-root chatgpt-connect.py may be the user's own download.
    path = Path(__file__).resolve().parents[2] / "scripts" / "chatgpt-connect.py"
    spec = importlib.util.spec_from_file_location("chatgpt_helper_transport_fixture", path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    return helper


@contextmanager
def http_fixture(status=200, body=b'{"fixture":true}', headers=None):
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            length = int(self.headers.get("Content-Length", "0"))
            requests.append({"path": self.path, "method": self.command,
                             "headers": dict(self.headers), "body": self.rfile.read(length)})
            self.send_response(status)
            for key, value in (headers or {"Content-Type": "application/json"}).items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(body)

        do_POST = do_GET

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.02), daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", requests
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        if thread.is_alive():
            raise RuntimeError("Loopback HTTP fixture did not stop")


class HelperTransportTests(unittest.TestCase):
    def setUp(self):
        self.helper = load_helper()

    def main_output(self, origin, pairing=PAIRING, flags=()):
        out, err = io.StringIO(), io.StringIO()
        with patch.object(self.helper.sys, "argv", ["chatgpt-connect.py", "--server", origin, *flags]), \
                patch("builtins.input", return_value=pairing) as visible, \
                patch.object(self.helper.getpass, "getpass", return_value=pairing) as hidden, \
                redirect_stdout(out), redirect_stderr(err):
            self.last_reads = {"input": visible, "getpass": hidden}
            status = self.helper.main()
        return status, out.getvalue() + err.getvalue()

    def test_bearer_transfer_uses_browser_agent_without_console_cookie(self):
        with http_fixture() as (origin, requests):
            result = self.helper.request_json(origin + "/api/chatgpt/link/registration", token=PAIRING,
                                              data={"client_id": "fixture-issued-client"})
        self.assertEqual(result, {"fixture": True})
        self.assertEqual(len(requests), 1)
        request = requests[0]
        self.assertEqual(request["method"], "POST")
        self.assertEqual(request["path"], "/api/chatgpt/link/registration")
        self.assertEqual(request["headers"]["Authorization"], "Bearer " + PAIRING)
        self.assertTrue(request["headers"]["User-Agent"].startswith("Mozilla/5.0"))
        self.assertEqual(request["headers"]["Accept"], "application/json")
        self.assertEqual(json.loads(request["body"]), {"client_id": "fixture-issued-client"})
        self.assertFalse(any(key.lower() == "cookie" for key in request["headers"]))

    def test_redirect_is_never_followed_and_bearer_never_reaches_destination(self):
        with http_fixture() as (destination, redirected), \
                http_fixture(status=302, body=b"", headers={"Location": destination + "/login"}) as (origin, requests):
            with self.assertRaises(self.helper.ConnectionFailure) as failure:
                self.helper.request_json(origin + "/api/chatgpt/link/parameters", token=PAIRING)
            self.assertIn("login Console", str(failure.exception))
            self.assertNotIn(PAIRING, str(failure.exception))
            self.assertEqual(len(requests), 1)
            self.assertEqual(requests[0]["headers"]["Authorization"], "Bearer " + PAIRING)
            self.assertEqual(redirected, [])

    def test_http_error_and_unknown_payloads_never_print_response_or_pairing(self):
        cases = [
            (403, ("<html>" + PRIVATE_RESPONSE + "</html>").encode(), "text/html"),
            (500, json.dumps({"detail": PRIVATE_RESPONSE, "private": PAIRING}).encode(), "application/json"),
            (200, ("malformed-json:" + PRIVATE_RESPONSE).encode(), "application/json"),
            (200, json.dumps({"unexpected": PRIVATE_RESPONSE}).encode(), "application/json"),
            (200, json.dumps([PRIVATE_RESPONSE]).encode(), "application/json"),
        ]
        for status, body, content_type in cases:
            with self.subTest(status=status, payload_type=content_type), \
                    http_fixture(status=status, body=body, headers={"Content-Type": content_type}) as (origin, requests):
                result, output = self.main_output(origin)
                self.assertEqual(result, 1)
                self.assertTrue(output.strip())
                self.assertNotIn(PRIVATE_RESPONSE, output)
                self.assertNotIn(PAIRING, output)
                self.assertEqual(len(requests), 1)

    def test_recognized_expired_code_has_fixed_italian_message(self):
        body = json.dumps({"detail": "chatgpt.errors.linkExpired", "private": PRIVATE_RESPONSE}).encode()
        with http_fixture(status=409, body=body) as (origin, requests):
            result, output = self.main_output(origin)
        self.assertEqual(result, 1)
        self.assertIn("Il codice di associazione è scaduto o già usato.", output)
        self.assertIn("Collega ChatGPT", output)
        self.assertNotIn(PRIVATE_RESPONSE, output)
        self.assertNotIn(PAIRING, output)
        self.assertEqual(len(requests), 1)

    def test_invalid_pairing_input_is_not_echoed_and_never_starts_transport(self):
        for pairing in ["short-secret-input", "x" * 101]:
            with self.subTest(length=len(pairing)), patch.object(self.helper, "connect") as connect:
                result, output = self.main_output("https://fixture.example.invalid", pairing)
                self.assertEqual(result, 1)
                self.assertIn("Copia tutto il codice di associazione", output)
                self.assertNotIn(pairing, output)
                connect.assert_not_called()

    def test_default_input_is_visible_and_hidden_input_remains_opt_in(self):
        for flags, reader, unused in [((), "input", "getpass"), (("--hide-code",), "getpass", "input")]:
            with self.subTest(flags=flags), patch.object(self.helper, "connect") as connect:
                result, output = self.main_output("https://fixture.example.invalid", flags=flags)
                self.assertEqual(result, 0)
                self.last_reads[reader].assert_called_once()
                self.last_reads[unused].assert_not_called()
                connect.assert_called_once_with("https://fixture.example.invalid", PAIRING,
                                                no_browser=False, callback_port=0)
                self.assertNotIn(PAIRING, output)

    def test_invalid_callback_ports_fail_before_reading_code_or_starting_transport(self):
        for value in ["-1", "65536", "not-a-port"]:
            with self.subTest(value=value), patch.object(self.helper, "connect") as connect:
                with self.assertRaises(SystemExit) as failure:
                    self.main_output("https://fixture.example.invalid", flags=("--callback-port", value))
                self.assertEqual(failure.exception.code, 2)
                self.last_reads["input"].assert_not_called()
                self.last_reads["getpass"].assert_not_called()
                connect.assert_not_called()

    def test_valid_callback_port_boundaries_and_ssh_flags_reach_connector(self):
        for value in [0, 1455, 65535]:
            with self.subTest(port=value), patch.object(self.helper, "connect") as connect:
                result, output = self.main_output("https://fixture.example.invalid",
                    flags=("--callback-port", str(value), "--no-browser"))
                self.assertEqual(result, 0)
                connect.assert_called_once_with("https://fixture.example.invalid", PAIRING,
                                                no_browser=True, callback_port=value)
                self.assertNotIn(PAIRING, output)

    def test_no_browser_callback_uses_fixed_or_dynamic_loopback_port_and_preserves_pkce(self):
        with socket.socket() as reserve:
            reserve.bind(("127.0.0.1", 0))
            fixed_port = reserve.getsockname()[1]
        for port in [0, fixed_port]:
            with self.subTest(port=port):
                calls, query, printed, threads, callback_errors = [], {}, [], [], []

                def request_json(url, **kwargs):
                    calls.append((url, kwargs))
                    if url.endswith("/parameters"):
                        self.assertEqual(kwargs["token"], PAIRING)
                        return {"client_id": "dynamic_agent_client", "nonce": "fixture-nonce",
                                "host_id": "urn:uuid:fixture", "agent_name": "CounselorBot"}
                    if url.endswith("/registration"):
                        self.assertEqual(kwargs["token"], PAIRING)
                        self.assertEqual(kwargs["data"], {"client_id": "fixture-issued-client"})
                        return {"registered": True}
                    if url.endswith("/oauth/token"):
                        data = kwargs["data"]
                        self.assertTrue(kwargs["form"])
                        self.assertEqual(data["redirect_uri"], query["redirect_uri"][0])
                        self.assertEqual(data["client_id"], "fixture-issued-client")
                        self.assertEqual(data["code"], "fixture-authorization-code")
                        challenge = self.helper.base64.urlsafe_b64encode(
                            self.helper.hashlib.sha256(data["code_verifier"].encode()).digest()).rstrip(b"=").decode()
                        self.assertEqual(challenge, query["code_challenge"][0])
                        return {"access_token": PRIVATE_RESPONSE, "refresh_token": PRIVATE_RESPONSE,
                                "id_token": PRIVATE_RESPONSE, "token_type": "Bearer"}
                    self.assertEqual(url, "https://fixture.example.invalid/api/chatgpt/link/complete")
                    self.assertEqual(kwargs["token"], PAIRING)
                    self.assertEqual(kwargs["data"]["client_id"], "fixture-issued-client")
                    self.assertEqual(kwargs["data"]["access_token"], PRIVATE_RESPONSE)
                    self.assertNotIn("username", kwargs["data"])
                    return {"connected": True}

                def printed_line(message, **_):
                    printed.append(str(message))
                    if not str(message).startswith(self.helper.ISSUER + "/api/accounts/authorize?"):
                        return
                    query.update(urllib.parse.parse_qs(urllib.parse.urlsplit(message).query))
                    redirect = urllib.parse.urlsplit(query["redirect_uri"][0])
                    self.assertEqual(redirect.hostname, "127.0.0.1")
                    self.assertEqual(redirect.path, "/auth/callback")
                    self.assertGreater(redirect.port, 0)
                    if port:
                        self.assertEqual(redirect.port, port)
                    self.assertEqual(query["nonce"], ["fixture-nonce"])
                    self.assertEqual(query["code_challenge_method"], ["S256"])

                    def callback():
                        try:
                            wrong = urllib.parse.urlencode({"state": "wrong-state", "code": "untrusted"})
                            try:
                                urllib.request.urlopen(query["redirect_uri"][0] + "?" + wrong, timeout=5)
                                raise AssertionError("Invalid state was accepted")
                            except urllib.error.HTTPError as error:
                                self.assertEqual(error.code, 400)
                            valid = urllib.parse.urlencode({"state": query["state"][0],
                                "code": "fixture-authorization-code", "client_id": "fixture-issued-client"})
                            with urllib.request.urlopen(query["redirect_uri"][0] + "?" + valid, timeout=5) as response:
                                self.assertEqual(response.status, 200)
                                self.assertEqual(response.headers["Cache-Control"], "no-store")
                        except Exception as error:
                            callback_errors.append(error)

                    thread = threading.Thread(target=callback, daemon=True)
                    thread.start()
                    threads.append(thread)

                with patch.object(self.helper, "request_json", side_effect=request_json), \
                        patch.object(self.helper, "print", side_effect=printed_line, create=True), \
                        patch.object(self.helper.webbrowser, "open") as browser:
                    self.helper.connect("https://fixture.example.invalid", PAIRING,
                                        no_browser=True, callback_port=port)
                    browser.assert_not_called()
                for thread in threads:
                    thread.join(timeout=5)
                    self.assertFalse(thread.is_alive())
                self.assertEqual(callback_errors, [])
                self.assertEqual(len(calls), 4)
                self.assertNotIn(PAIRING, "\n".join(printed))
                self.assertNotIn(PRIVATE_RESPONSE, "\n".join(printed))

    def test_occupied_callback_port_fails_safely_without_browser_or_credential_exchange(self):
        parameters = {"client_id": "dynamic_agent_client", "nonce": "fixture-nonce",
                      "host_id": "urn:uuid:fixture", "agent_name": "CounselorBot"}
        with socket.socket() as occupied:
            occupied.bind(("127.0.0.1", 0))
            occupied.listen()
            port = occupied.getsockname()[1]
            with patch.object(self.helper, "request_json", return_value=parameters) as transport, \
                    patch.object(self.helper.webbrowser, "open") as browser:
                result, output = self.main_output("https://fixture.example.invalid",
                                                 flags=("--no-browser", "--callback-port", str(port)))
                self.assertEqual(result, 1)
                self.assertTrue(output.strip())
                self.assertNotIn(PAIRING, output)
                self.assertNotIn(PRIVATE_RESPONSE, output)
                browser.assert_not_called()
                self.assertTrue(all(call.args[0].endswith("/parameters") for call in transport.call_args_list))


if __name__ == "__main__":
    unittest.main()
