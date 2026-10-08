from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    log_level: str = "INFO"
    cron_secret: str = ""
    database_url: str = ""
    api_prefix: str = "/svc"
    public_base_url: str = "http://localhost:3000"

    # Shared with the Next app (same Vercel project env)
    better_auth_secret: str = ""
    better_auth_url: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""


settings = Settings()
