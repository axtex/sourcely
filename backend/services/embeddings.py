"""
services/embeddings.py — Text embedding via OpenAI.

Uses text-embedding-3-small (1536 dimensions). It's critical that we use
the SAME model for both ingestion (chunking) and querying — different models
produce incompatible vector spaces and similarity scores would be meaningless.
"""

import os
import logging
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
MAX_BATCH_SIZE = 100  # OpenAI allows up to 2048 inputs per call; 100 is safe

_client = None


def _get_client() -> OpenAI:
    """Lazy-init the OpenAI client (avoids import-time side effects)."""
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _client


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Embed a list of text strings using OpenAI's embedding model.

    Processes in batches of MAX_BATCH_SIZE to stay within API limits.
    Returns a list of 1536-float vectors in the same order as input.
    """
    if not texts:
        return []

    client = _get_client()
    all_embeddings: list[list[float]] = []

    # Split into batches to avoid hitting per-request limits
    for batch_start in range(0, len(texts), MAX_BATCH_SIZE):
        batch = texts[batch_start : batch_start + MAX_BATCH_SIZE]
        logger.info(
            f"Embedding batch {batch_start // MAX_BATCH_SIZE + 1} "
            f"({len(batch)} texts)..."
        )

        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=batch,
        )

        # Log token usage so you can monitor API costs
        usage = response.usage
        logger.info(
            f"  Tokens used: {usage.total_tokens} "
            f"(prompt: {usage.prompt_tokens})"
        )

        batch_embeddings = [item.embedding for item in response.data]
        all_embeddings.extend(batch_embeddings)

    return all_embeddings
