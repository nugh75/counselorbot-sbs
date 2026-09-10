"""Create isolated service credentials once, inside dedicated Docker volumes."""
from pathlib import Path
import secrets

for name, user in [('owner', 'prompt_lab_owner'), ('worker', 'prompt_lab_worker')]:
    folder = Path('/secrets') / name
    folder.mkdir(parents=True, exist_ok=True)
    password = folder / 'password'
    if not password.exists():
        password.write_text(secrets.token_urlsafe(36))
        password.chmod(0o444)
    url = folder / 'database_url'
    url.write_text(f'postgresql://{user}:{password.read_text().strip()}@prompt-lab-postgres:5432/prompt_lab')
    url.chmod(0o444)
