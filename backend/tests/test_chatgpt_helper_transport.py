"""Real loopback HTTP checks for the tracked helper; no provider, SSO or DB access."""
from contextlib import contextmanager, redirect_stderr, redirect_stdout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch


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

    def main_output(self, origin, pairing=PAIRING):
        out, err = io.StringIO(), io.StringIO()
        with patch.object(self.helper.sys, "argv", ["chatgpt-connect.py", "--server", origin]), \
                patch.object(self.helper.getpass, "getpass", return_value=pairing), \
                redirect_stdout(out), redirect_stderr(err):
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


if __name__ == "__main__":
    unittest.main()
