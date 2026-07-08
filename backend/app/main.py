from fastapi import FastAPI

from app.api.router import api_router

app = FastAPI(
    title="Visual Search Engine API",
    version="1.0.0",
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"message": "Visual Search Engine API"}


@app.get("/health")
async def health():
    return {"status": "OK"}
