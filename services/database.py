import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def get_database_path() -> Path:
    configured_path = os.getenv("DATABASE_PATH")
    if configured_path:
        return Path(configured_path).expanduser()

    return PROJECT_ROOT / "teamcenter.db"
