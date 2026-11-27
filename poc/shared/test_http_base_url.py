import unittest

from contract_harness import validate_base_url as validate_contract_url
from crash_recovery_harness import validate_base_url as validate_crash_url


class BaseUrlValidationTests(unittest.TestCase):
    def test_accepts_http_and_https_origins(self):
        for validator in (validate_contract_url, validate_crash_url):
            self.assertEqual(validator("http://127.0.0.1:8080").scheme, "http")
            self.assertEqual(validator("https://example.test:8443").scheme, "https")

    def test_rejects_non_http_schemes(self):
        for validator in (validate_contract_url, validate_crash_url):
            for value in ("file:///etc/passwd", "ftp://example.test", "javascript:alert(1)"):
                with self.subTest(validator=validator.__module__, value=value):
                    with self.assertRaises(ValueError):
                        validator(value)

    def test_rejects_credentials_and_extra_url_components(self):
        for validator in (validate_contract_url, validate_crash_url):
            for value in (
                "http://user:password@example.test",
                "http://example.test/path",
                "http://example.test?query=1",
                "http://example.test#fragment",
            ):
                with self.subTest(validator=validator.__module__, value=value):
                    with self.assertRaises(ValueError):
                        validator(value)


if __name__ == "__main__":
    unittest.main()
