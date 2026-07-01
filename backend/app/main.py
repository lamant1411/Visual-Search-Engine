from fastapi import FastAPI

app = FastAPI(
    title="Visual Search Engine API",
    version="1.0.0",
)


@app.get("/")
async def root():
    return {"message": "Visual Search Engine API"}


@app.get("/health")
async def health():
    return {"status": "OK"}