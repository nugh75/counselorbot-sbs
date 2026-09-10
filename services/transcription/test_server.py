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


def engine(language='fr', text=' Bonjour. '):
    model = Mock()
    model.transcribe.return_value = ([SimpleNamespace(text=text)], SimpleNamespace(language=language))
    return model


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
        model = engine()
        upload = UploadFile(io.BytesIO(wav()))
        with patch.object(server, 'load', Mock(return_value=model)) as load:
            result = server.transcribe(upload, 'fr', 'large-v3')
        self.assertEqual(result, {'text': 'Bonjour.', 'language': 'fr', 'model': 'large-v3', 'duration': 1.0})
        self.assertTrue(upload.file.closed)
        self.assertEqual(load.call_args.args, ('large-v3',))
        self.assertEqual(model.transcribe.call_args.kwargs['task'], 'transcribe')
        self.assertEqual(model.transcribe.call_args.kwargs['language'], 'fr')
        self.assertTrue(model.transcribe.call_args.kwargs['vad_filter'])

    def test_domain_glossary_primes_the_decoder_in_the_spoken_language(self):
        model = engine()
        with patch.object(server, 'load', Mock(return_value=model)):
            server.transcribe(UploadFile(io.BytesIO(wav())), 'it')
        prompt = model.transcribe.call_args.kwargs['initial_prompt']
        self.assertIn('QSA', prompt)
        self.assertIn('metacognizione', prompt)

    def test_automatic_language_is_detected_on_the_small_model(self):
        model = engine(language='sv')
        detector = Mock()
        detector.detect_language.return_value = ('sv', 0.94, None)
        with patch.object(server, 'load', Mock(side_effect=lambda name: detector if name == 'small' else model)):
            result = server.transcribe(UploadFile(io.BytesIO(wav())), 'auto')
        self.assertEqual(model.transcribe.call_args.kwargs['language'], 'sv')
        self.assertEqual(result['language'], 'sv')
        self.assertIn('metakognition', model.transcribe.call_args.kwargs['initial_prompt'])

    def test_an_unsure_detection_is_left_to_the_transcribing_model(self):
        model = engine(language='fr')
        detector = Mock()
        detector.detect_language.return_value = ('cy', 0.31, None)
        with patch.object(server, 'load', Mock(side_effect=lambda name: detector if name == 'small' else model)):
            server.transcribe(UploadFile(io.BytesIO(wav())), 'auto')
        self.assertIsNone(model.transcribe.call_args.kwargs['language'])
        self.assertNotIn('metacognizione', model.transcribe.call_args.kwargs['initial_prompt'])

    def test_the_small_model_detects_for_itself(self):
        model = engine(language='it')
        with patch.object(server, 'load', Mock(return_value=model)) as load:
            server.transcribe(UploadFile(io.BytesIO(wav())), 'auto', 'small')
        self.assertIsNone(model.transcribe.call_args.kwargs['language'])
        self.assertEqual([call.args[0] for call in load.call_args_list], ['small'])

    def test_requests_queue_for_a_slot_before_being_refused(self):
        with patch.object(server, 'load', Mock(return_value=engine())), patch.object(server, 'QUEUE_WAIT', 0.05):
            for _ in range(server.SLOTS):
                server.slot.acquire()
            try:
                with self.assertRaises(HTTPException) as error:
                    server.transcribe(UploadFile(io.BytesIO(wav())), 'it')
                self.assertEqual(error.exception.detail, 'busy')
            finally:
                for _ in range(server.SLOTS):
                    server.slot.release()

    def test_failures_release_the_inference_slot(self):
        with patch.object(server, 'load', Mock(return_value=engine())):
            with self.assertRaises(HTTPException):
                server.transcribe(UploadFile(io.BytesIO(b'corrupt')), 'it')
            model = engine()
            model.transcribe.side_effect = RuntimeError('inference failed')
            with patch.object(server, 'load', Mock(return_value=model)), self.assertRaises(RuntimeError):
                server.transcribe(UploadFile(io.BytesIO(wav())), 'it')
        for _ in range(server.SLOTS):
            self.assertTrue(server.slot.acquire(blocking=False))
        for _ in range(server.SLOTS):
            server.slot.release()

    def test_models_are_loaded_once_and_kept_resident(self):
        built = []
        with patch.object(server, 'WhisperModel', lambda *args, **kwargs: built.append(args) or Mock()):
            server.loaded.clear()
            first, again = server.load('small'), server.load('small')
            server.load('large-v3')
            self.assertIs(first, again)
            self.assertEqual([args[0] for args in built], ['/models/small', '/models/large-v3'])
            self.assertEqual(sorted(server.loaded), ['large-v3', 'small'])
        server.loaded.clear()


if __name__ == '__main__':
    unittest.main()
