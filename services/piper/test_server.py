"""Run inside the Piper image; no downloads or database access."""
import unittest
from unittest.mock import Mock, patch

import server


class VoiceProfilesTest(unittest.TestCase):
    def test_both_voice_genders_are_installed_in_every_language(self):
        for language in ('it', 'en', 'es', 'fr', 'de', 'sv'):
            voices = [v for v in server.catalog.values() if v['language']['family'] == language]
            self.assertEqual({v['gender'] for v in voices}, {'female', 'male'})
            for voice in voices:
                self.assertTrue(server.Path(f"models/{voice['key']}.onnx").is_file())
        self.assertEqual(server.catalog['es_ES-sharvard-medium']['speaker_id_map']['F'], 1)
        self.assertEqual(server.catalog['fr_FR-upmc-medium']['speaker_id_map']['pierre'], 1)

    def test_multi_speaker_models_use_the_selected_speaker(self):
        for key in ('es_ES-sharvard-medium', 'fr_FR-upmc-medium', 'it_IT-paola-medium'):
            def write_wav(text, wav, syn_config):
                self.assertEqual(syn_config.speaker_id, 1 if key in ('es_ES-sharvard-medium', 'fr_FR-upmc-medium') else None)
                wav.setparams((1, 2, 22050, 0, 'NONE', 'NONE'))
                wav.writeframes(b'\x00\x00' * 10)
            with patch.object(server, 'load_voice', return_value=Mock(synthesize_wav=write_wav)):
                response = server.synthesize(server.SpeechRequest(text='Test', voice=key))
                self.assertEqual(response.media_type, 'audio/wav')
                self.assertEqual(response.body[:4], b'RIFF')


if __name__ == '__main__':
    unittest.main()
