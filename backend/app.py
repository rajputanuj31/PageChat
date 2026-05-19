import asyncio
import json
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


# text/event-stream (SSE) is recognized by every proxy as a live event stream
# that must not be buffered — unlike text/plain which Render's proxy buffers in full.
SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
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
            yield f"data: {json.dumps(token)}\n\n"

    return StreamingResponse(token_stream(), media_type="text/event-stream", headers=SSE_HEADERS)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

