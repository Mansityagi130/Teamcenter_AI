from datetime import datetime, timedelta

from ..config import settings
from ..db import session


def reset_all_daily_usage() -> int:
    today = datetime.utcnow().date().isoformat()
    reset_at = (datetime.utcnow() + timedelta(hours=24)).isoformat()
    with session() as conn:
        result = conn.execute(
            """
            UPDATE user_daily_usage
            SET usage_date = ?, tokens_used = 0, token_limit = ?, reset_at = ?, updated_at = CURRENT_TIMESTAMP
            """,
            (today, settings.daily_token_limit, reset_at),
        )
        return result.rowcount


if __name__ == "__main__":
    count = reset_all_daily_usage()
    print(f"Reset daily token usage for {count} users.")
