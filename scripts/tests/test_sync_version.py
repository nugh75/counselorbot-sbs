import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('sync_version', Path(__file__).resolve().parents[1] / 'sync-version.py')
sync_version = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync_version)


def write(root, name, text):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


class SyncVersionTests(unittest.TestCase):
    def make_repo(self, folder, version='0.2.0'):
        root = Path(folder)
        write(root, 'VERSION', version + '\n')
        write(root, 'frontend/package.json', json.dumps({'name': 'frontend', 'version': '0.1.0'}, indent=2) + '\n')
        write(root, 'frontend/package-lock.json', json.dumps(
            {'name': 'frontend', 'version': '0.1.0', 'packages': {'': {'version': '0.1.0'}}}, indent=2) + '\n')
        write(root, 'backend/version.py', '"""doc"""\n__version__ = "0.1.0"\n')
        write(root, 'desktop/teacher/src-tauri/tauri.conf.json', json.dumps({'version': '0.1.0'}, indent=2) + '\n')
        return root

    def test_check_reports_every_stale_target_without_writing(self):
        with tempfile.TemporaryDirectory() as folder:
            root = self.make_repo(folder)
            _, stale = sync_version.sync(root, write=False)
            self.assertEqual(sorted(stale), sorted([
                'frontend/package.json', 'frontend/package-lock.json',
                'desktop/teacher/src-tauri/tauri.conf.json', 'backend/version.py']))
            self.assertIn('"0.1.0"', (root / 'backend/version.py').read_text())

    def test_write_propagates_then_check_is_clean(self):
        with tempfile.TemporaryDirectory() as folder:
            root = self.make_repo(folder)
            sync_version.sync(root, write=True)
            self.assertEqual(sync_version.sync(root, write=False), ('0.2.0', []))
            lock = json.loads((root / 'frontend/package-lock.json').read_text())
            self.assertEqual((lock['version'], lock['packages']['']['version']), ('0.2.0', '0.2.0'))
            self.assertIn('__version__ = "0.2.0"', (root / 'backend/version.py').read_text())

    def test_invalid_version_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = self.make_repo(folder, version='v1.0')
            with self.assertRaises(ValueError):
                sync_version.sync(root, write=False)

    def test_repository_is_aligned(self):
        self.assertEqual(sync_version.sync(sync_version.ROOT, write=False)[1], [])


if __name__ == '__main__':
    unittest.main()
