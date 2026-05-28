from fastapi import FastAPI

from .db import init_db
from .routers import auth, chat, settings

app = FastAPI(title="AI Chat API")


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/health")
def health():
    return {"status": "healthy"}


app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(settings.router)
