"""
routers/query.py — RAG query endpoint.

Pipeline:
  1. Embed the user's question with the same OpenAI model used during ingestion
  2. Similarity search in pgvector to find relevant chunks
  3. Build a numbered context string from the retrieved passages
  4. Call Claude Haiku with a strict citation prompt
  5. Return the answer + source passages for display in the UI
"""

import logging
import os
from typing import Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import db as database
from services.embeddings import generate_embeddings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/query", tags=["query"])

# Claude model — must match CLAUDE.md spec
CLAUDE_MODEL = "claude-haiku-4-5-20251001"

_anthropic_client = None


def _get_anthropic_client() -> anthropic.Anthropic:
    """Lazy-init Anthropic client (avoids import-time side effects)."""
    global _anthropic_client
    if _anthropic_client is None:
        _anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    return _anthropic_client


# ── Request / response models ─────────────────────────────────────────────────

class QueryRequest(BaseModel):
    question: str
    document_id: Optional[str] = None
    top_k: int = 5


class SourcePassage(BaseModel):
    content: str
    similarity: float
    chunk_index: int
    page_number: Optional[int]
    document_id: str


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourcePassage]
    question: str
    document_id: Optional[str]


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("", response_model=QueryResponse)
def query_documents(request: QueryRequest, conn=Depends(database.get_db)):
    """
    Answer a question about one or all uploaded documents using RAG.
    """
    # 1. Validate
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    # 2. Embed the question using the same model as ingestion
    #    This is critical: the query vector must live in the same space as the
    #    stored chunk vectors or cosine similarity scores are meaningless.
    logger.info(f"Embedding question: {request.question[:80]}...")
    embeddings = generate_embeddings([request.question])
    query_embedding = embeddings[0]

    # 3. Retrieve the top-k most similar chunks from pgvector
    logger.info(
        f"Searching for top {request.top_k} chunks"
        + (f" in document {request.document_id}" if request.document_id else " across all documents")
    )
    chunks = database.similarity_search(
        conn,
        query_embedding=query_embedding,
        document_id=request.document_id,
        limit=request.top_k,
    )

    if not chunks:
        return QueryResponse(
            answer="I could not find any relevant passages in the document(s). Please make sure the document has been processed successfully.",
            sources=[],
            question=request.question,
            document_id=request.document_id,
        )

    # 4. Format retrieved passages as a numbered context block
    #    The citation numbers [1], [2]... in the prompt correspond to these.
    context_lines = []
    for i, chunk in enumerate(chunks, start=1):
        page_label = f"page {chunk['page_number']}" if chunk.get("page_number") else "unknown page"
        context_lines.append(f"[{i}] ({page_label}): {chunk['content']}")
    context_text = "\n\n".join(context_lines)

    # 5. Call Claude Haiku with a citation-enforcing system prompt
    logger.info(f"Calling Claude ({CLAUDE_MODEL}) for answer generation")
    client = _get_anthropic_client()

    system_prompt = (
        "You are a precise document assistant. "
        "Answer questions using ONLY the provided context passages. "
        "Always cite which passage number(s) your answer comes from using [1], [2] etc. "
        "If the answer is not in the context, say 'I could not find this in the document.' "
        "Never make up information."
    )

    user_message = f"Context passages:\n{context_text}\n\nQuestion: {request.question}"

    message = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    answer = message.content[0].text
    logger.info(f"Answer generated ({len(answer)} chars)")

    # 6. Build source objects for the UI to display
    sources = [
        SourcePassage(
            content=chunk["content"],
            similarity=float(chunk["similarity"]),
            chunk_index=chunk["chunk_index"],
            page_number=chunk.get("page_number"),
            document_id=chunk["document_id"],
        )
        for chunk in chunks
    ]

    return QueryResponse(
        answer=answer,
        sources=sources,
        question=request.question,
        document_id=request.document_id,
    )
