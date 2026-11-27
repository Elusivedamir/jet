import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

from crash_recovery_harness import http_request


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/healthz":
            self.send_error(404)
            return
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length))
        body = json.dumps({"echo": payload}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass


class CrashHarnessHttpRequestTests(unittest.TestCase):
    def setUp(self):
        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()

    def test_health_probe_accepts_empty_204_response(self):
        status, body = http_request(self.base, "GET", "/healthz", account="alice")
        self.assertEqual(status, 204)
        self.assertIsNone(body)

    def test_json_request_returns_decoded_response(self):
        payload = {"message": "hello", "sequence": 7}
        status, body = http_request(self.base, "POST", "/echo", account="alice", payload=payload)
        self.assertEqual(status, 200)
        self.assertEqual(body, {"echo": payload})


if __name__ == "__main__":
    unittest.main()
