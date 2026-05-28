from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "AI Chat"
    database_url: str = "sqlite:///./ai_chat.db"
    jwt_secret: str = "replace-this-in-production"
    api_key_pepper: str = "replace-this-too"
    daily_token_limit: int = 100_000
    jwt_exp_minutes: int = 60 * 24
    model_name: str = "gpt-4.1-mini"


settings = Settings()
