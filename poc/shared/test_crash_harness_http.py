import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch

import crash_recovery_harness as harness
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


    def test_lost_response_waits_for_commit_without_reading_response(self):
        written = threading.Event()

        class CommitHandler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length", "0"))
                self.rfile.read(length)
                body = b'{"accepted":true}'
                self.send_response(202)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                self.wfile.flush()
                written.set()

            def log_message(self, format, *args):
                pass

        server = HTTPServer(("127.0.0.1", 0), CommitHandler)
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        base = f"http://127.0.0.1:{server.server_port}"

        def observe_commit(database_url, commit_sql, timeout=20):
            self.assertEqual(database_url, "test-database")
            self.assertEqual(commit_sql, "SELECT id FROM messages")
            if not written.wait(timeout):
                raise TimeoutError("test server did not write the acceptance response")
            return "committed-message-id"

        try:
            with patch.object(harness, "wait_for_sql_value", side_effect=observe_commit):
                message_id = harness.post_without_reading_response(
                    base,
                    "/v1/conversations/room/messages",
                    "alice",
                    {"operation_key": "lost-response-test", "payload": "hello"},
                    "test-database",
                    "SELECT id FROM messages",
                    timeout=2,
                )
            self.assertEqual(message_id, "committed-message-id")
            self.assertTrue(written.is_set())
        finally:
            server.shutdown()
            thread.join()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
