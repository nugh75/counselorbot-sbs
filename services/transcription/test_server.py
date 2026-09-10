import io
import unittest
import wave
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException, UploadFile
import server


def wav(seconds=1, channels=1, rate=16000):
    output = io.BytesIO()
    with wave.open(output, 'wb') as audio:
        audio.setnchannels(channels)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(b'\0\0' * int(seconds * rate) * channels)
    return output.getvalue()


class TranscriptionTests(unittest.TestCase):
    def test_stereo_is_resampled_without_changing_duration(self):
        samples = server.decode_audio(wav(channels=2, rate=48000))
        self.assertEqual(samples.shape, (16000,))

    def test_corrupt_and_overlong_audio(self):
        for data, status in [(b'not audio', 400), (wav(180.1), 413)]:
            with self.assertRaises(HTTPException) as error:
                server.decode_audio(data)
            self.assertEqual(error.exception.status_code, status)

    def test_local_model_transcribes_without_translation_and_releases_upload(self):
        model = Mock()
        model.transcribe.return_value = ([SimpleNamespace(text=' Bonjour. ')], None)
        upload = UploadFile(io.BytesIO(wav()))
        with patch.object(server, 'model', model):
            result = server.transcribe(upload, 'fr')
        self.assertEqual(result, {'text': 'Bonjour.', 'language': 'fr', 'duration': 1.0})
        self.assertTrue(upload.file.closed)
        self.assertEqual(model.transcribe.call_args.kwargs['task'], 'transcribe')
        self.assertEqual(model.transcribe.call_args.kwargs['language'], 'fr')
        self.assertTrue(model.transcribe.call_args.kwargs['vad_filter'])

    def test_busy_and_failure_release_the_inference_slot(self):
        with patch.object(server, 'model', Mock()):
            server.slot.acquire()
            try:
                with self.assertRaises(HTTPException) as error:
                    server.transcribe(UploadFile(io.BytesIO(wav())), 'it')
                self.assertEqual(error.exception.detail, 'busy')
            finally:
                server.slot.release()
            with self.assertRaises(HTTPException):
                server.transcribe(UploadFile(io.BytesIO(b'corrupt')), 'it')
            self.assertTrue(server.slot.acquire(blocking=False))
            server.slot.release()


if __name__ == '__main__':
    unittest.main()
