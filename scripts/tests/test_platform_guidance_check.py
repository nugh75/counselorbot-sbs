import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('guidance_check', Path(__file__).resolve().parents[1] / 'check-platform-guidance.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class GuidanceCheckTests(unittest.TestCase):
    def test_refresh_requires_changed_markdown(self):
        old = {'product_sha256': 'a', 'guide_sha256': 'x'}
        with self.assertRaises(ValueError):
            check.refresh({'product_sha256': 'b', 'guide_sha256': 'x'}, old)
        self.assertEqual(check.refresh({'product_sha256': 'b', 'guide_sha256': 'y'}, old)['guide_sha256'], 'y')

    def test_real_repository_add_change_delete_and_base(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            for path, text in [(check.GUIDE, '# CounselorBot\nOriginal'), ('frontend/src/page.tsx', 'original')]:
                target = root / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(text)
            original = check.snapshot(root)
            check.validate(original, original)
            check.git(root, 'add', '.')
            check.git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'baseline')
            source = root / 'frontend/src/page.tsx'
            source.write_text('changed')
            with self.assertRaises(ValueError):
                check.validate(check.snapshot(root), original)
            with self.assertRaises(ValueError):
                check.check_base(root, 'HEAD')
            (root / check.GUIDE).write_text('# CounselorBot\nUpdated')
            check.check_base(root, 'HEAD')
            updated = check.snapshot(root)
            check.refresh(updated, original)
            source.unlink()
            self.assertNotEqual(check.snapshot(root)['product_sha256'], updated['product_sha256'])
            source.write_text('changed')
            (root / 'frontend/src/new.tsx').write_text('new feature')
            self.assertNotEqual(check.snapshot(root)['product_sha256'], updated['product_sha256'])

    def test_scope_excludes_tests_but_covers_prompt_and_ui_changes(self):
        for name in ['backend/routes/new.py', 'backend/prompts/new.md', 'frontend/src/lib/i18n.ts', 'frontend/public/images/new.png', 'docker-compose.yml']:
            self.assertTrue(check.product_source(name), name)
        for name in ['backend/tests/test_chat.py', 'frontend/src/lib/thing.test.ts', 'HANDOFF.md']:
            self.assertFalse(check.product_source(name), name)
