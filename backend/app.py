import asyncio
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl

from doc_chain import build_chain


app = FastAPI(
    title="PageChat Backend",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    url: HttpUrl
    question: str
    api_key: Optional[str] = None
    page_content: Optional[str] = None


# Browsers buffer text/plain responses up to ~1445 bytes (MIME sniffing) before
# rendering anything — making streaming appear broken. X-Content-Type-Options: nosniff
# tells the browser to trust the declared Content-Type and skip sniffing, so tokens
# are rendered immediately as they arrive.
STREAMING_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Accel-Buffering": "no",
    "Cache-Control": "no-cache",
}


@app.post("/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question must not be empty.")

    try:
        # build_chain does sync network I/O (URL fetch + embeddings),
        # so run it in a thread to avoid blocking the event loop.
        chain = await asyncio.to_thread(build_chain, str(request.url), request.api_key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    async def token_stream():
        async for token in chain.astream(question):
            yield token

    return StreamingResponse(token_stream(), media_type="text/plain", headers=STREAMING_HEADERS)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

