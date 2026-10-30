import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('guidance_check', Path(__file__).resolve().parents[1] / 'check-platform-guidance.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class GuidanceCheckTests(unittest.TestCase):
    def test_base_requires_guide_update_with_product_change(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            for path, text in [(check.GUIDE, '# CounselorBot\nOriginal'), ('frontend/src/page.tsx', 'original')]:
                target = root / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(text)
            check.git(root, 'add', '.')
            check.git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'baseline')
            check.check_base(root, 'HEAD')
            (root / 'frontend/src/page.tsx').write_text('changed')
            with self.assertRaises(ValueError):
                check.check_base(root, 'HEAD')
            (root / check.GUIDE).write_text('# CounselorBot\nUpdated')
            check.check_base(root, 'HEAD')

    def test_scope_excludes_tests_but_covers_prompt_and_ui_changes(self):
        for name in ['backend/routes/new.py', 'backend/prompts/new.md', 'frontend/src/lib/i18n.ts', 'frontend/public/images/new.png', 'docker-compose.yml']:
            self.assertTrue(check.product_source(name), name)
        for name in ['backend/tests/test_chat.py', 'frontend/src/lib/thing.test.ts', 'HANDOFF.md']:
            self.assertFalse(check.product_source(name), name)
