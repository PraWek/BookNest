import base64
import os
import unittest
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"

from fastapi.testclient import TestClient

from backend.app.main import app


class FakeCommunicate:
    messages = []
    calls = []

    def __init__(self, **kwargs):
        self.calls.append(kwargs)

    async def stream(self):
        for message in self.messages:
            yield message


class TtsTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.payload = {"text": "  Привет,\n мир!  ", "voice": "ru-RU-SvetlanaNeural", "rate": 1.2}
        FakeCommunicate.calls = []
        FakeCommunicate.messages = [
            {"type": "audio", "data": b"first"},
            {"type": "WordBoundary", "text": "Привет", "offset": 2_000_000, "duration": 3_000_000},
            {"type": "audio", "data": b"second"},
            {"type": "WordBoundary", "text": "мир", "offset": 6_000_000, "duration": 2_000_000},
        ]
        self.patcher = patch("backend.app.main.edge_tts.Communicate", FakeCommunicate)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def test_narration_keeps_audio_and_converts_word_timestamps_to_seconds(self):
        response = self.client.post("/api/tts/narration", json=self.payload)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(base64.b64decode(result["audio"]), b"firstsecond")
        self.assertEqual(result["boundaries"], [
            {"text": "Привет", "start": 0.2, "duration": 0.3},
            {"text": "мир", "start": 0.6, "duration": 0.2},
        ])
        self.assertEqual(FakeCommunicate.calls[0], {
            "text": "Привет, мир!", "voice": self.payload["voice"], "rate": "+20%", "boundary": "WordBoundary",
        })
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_audio_endpoint_still_returns_mp3(self):
        response = self.client.post("/api/tts/speech", json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "audio/mpeg")
        self.assertEqual(response.content, b"firstsecond")

    def test_audio_without_boundaries_can_still_be_played(self):
        FakeCommunicate.messages = [{"type": "audio", "data": b"mp3"}]
        response = self.client.post("/api/tts/narration", json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["boundaries"], [])

    def test_empty_audio_is_a_service_error(self):
        FakeCommunicate.messages = []
        self.assertEqual(self.client.post("/api/tts/narration", json=self.payload).status_code, 502)

    def test_provider_failure_is_a_service_error(self):
        with patch("backend.app.main.edge_tts.Communicate", side_effect=RuntimeError("unavailable")):
            self.assertEqual(self.client.post("/api/tts/narration", json=self.payload).status_code, 502)

    def test_unknown_voice_and_whitespace_are_rejected(self):
        for payload in [dict(self.payload, voice="unknown"), dict(self.payload, text=" \n ")]:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/api/tts/narration", json=payload).status_code, 400)
        self.assertEqual(FakeCommunicate.calls, [])

    def test_text_and_speed_limits_are_validated(self):
        for payload in [dict(self.payload, text="x" * 3001), dict(self.payload, rate=2)]:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/api/tts/narration", json=payload).status_code, 422)


if __name__ == "__main__":
    unittest.main()
