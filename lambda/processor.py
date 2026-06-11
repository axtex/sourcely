"""
lambda/processor.py — S3-triggered PDF processing Lambda.

Triggered automatically when a PDF lands in:
  s3://sourcely-axtex-bucket/documents/{doc_id}/{filename}.pdf

The handler mirrors services/processor.py but is self-contained:
  - No FastAPI or profile-based boto3 (Lambda uses its IAM role)
  - Reads DATABASE_URL, OPENAI_API_KEY, AWS_S3_BUCKET from env vars
  - Lazy-initialises boto3/OpenAI clients so warm invocations skip setup

Flow: parse event → download PDF → extract text → chunk → embed → store → mark processed
"""

import json
import logging
import os
import urllib.parse
from datetime import datetime, timezone

import boto3
import fitz  # PyMuPDF
import psycopg2
import psycopg2.extras
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openai import OpenAI
from pgvector.psycopg2 import register_vector

# Lambda provides a root logger; just set the level
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ── Config ────────────────────────────────────────────────────────────────────
# All secrets come from Lambda env vars (set via console or AWS CLI)
DATABASE_URL = os.environ["DATABASE_URL"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
BUCKET_NAME = os.environ.get("AWS_S3_BUCKET", "sourcely-axtex-bucket")
AWS_REGION = os.environ.get("AWS_REGION", "us-west-2")

EMBEDDING_MODEL = "text-embedding-3-small"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
MIN_PAGE_CHARS = 50

# Module-level singletons — reused across warm invocations to save init time
_openai_client = None
_s3_client = None


def _get_openai() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI(api_key=OPENAI_API_KEY)
    return _openai_client


def _get_s3():
    global _s3_client
    if _s3_client is None:
        # No profile here — Lambda authenticates via its IAM execution role
        _s3_client = boto3.client("s3", region_name=AWS_REGION)
    return _s3_client


# ── Entry point ───────────────────────────────────────────────────────────────

def handler(event, context):
    """
    Lambda entry point. S3 can batch multiple ObjectCreated records in one
    invocation (rare but possible for high-throughput buckets).
    """
    logger.info(f"Event: {json.dumps(event)}")

    for record in event.get("Records", []):
        s3_info = record["s3"]
        bucket = s3_info["bucket"]["name"]
        # S3 event keys are URL-encoded — spaces become '+', special chars become %XX
        key = urllib.parse.unquote_plus(s3_info["object"]["key"])

        logger.info(f"Processing s3://{bucket}/{key}")

        # Key format: documents/{doc_id}/{filename}
        # The prefix filter on the S3 trigger ensures we only get documents/ keys,
        # but we validate defensively anyway.
        parts = key.split("/")
        if len(parts) < 3 or parts[0] != "documents":
            logger.warning(f"Unexpected key format, skipping: {key}")
            continue

        doc_id = parts[1]
        _process(doc_id, key)

    return {"statusCode": 200}


# ── Processing pipeline ───────────────────────────────────────────────────────

def _process(doc_id: str, s3_key: str):
    """Full ingestion pipeline for one document. Mirrors services/processor.py."""
    conn = psycopg2.connect(DATABASE_URL)
    # register_vector teaches psycopg2 to serialise Python lists as pgvector literals
    register_vector(conn)

    try:
        # Step 1: mark as processing so the frontend badge updates immediately
        _update_status(conn, doc_id, "processing")
        logger.info(f"[{doc_id}] Marked as processing")

        # Step 2: download the PDF bytes from S3
        s3 = _get_s3()
        response = s3.get_object(Bucket=BUCKET_NAME, Key=s3_key)
        pdf_bytes = response["Body"].read()
        logger.info(f"[{doc_id}] Downloaded {len(pdf_bytes):,} bytes from S3")

        # Step 3: extract text page-by-page with PyMuPDF
        page_texts = _extract_pages(pdf_bytes)
        total_chars = sum(len(t) for t in page_texts.values())
        logger.info(f"[{doc_id}] Extracted {total_chars:,} chars from {len(page_texts)} pages")

        # Step 4: chunk each page into overlapping segments
        chunks = _chunk_pages(page_texts)
        logger.info(f"[{doc_id}] Created {len(chunks)} chunks")

        # Step 5: embed all chunks via OpenAI
        texts = [c["content"] for c in chunks]
        embeddings = _embed(texts)
        for chunk, emb in zip(chunks, embeddings):
            chunk["embedding"] = emb

        # Step 6: persist chunks + embeddings to the database
        _insert_chunks(conn, doc_id, chunks)
        logger.info(f"[{doc_id}] Chunks stored")

        # Step 7: mark processed — UI will show chunk count + enable selection
        _update_status(conn, doc_id, "processed", datetime.now(timezone.utc))
        logger.info(f"[{doc_id}] Processing complete ✓")

    except Exception as e:
        logger.error(f"[{doc_id}] Processing failed: {e}", exc_info=True)
        try:
            _update_status(conn, doc_id, "failed")
        except Exception:
            pass  # don't mask the original error
        raise

    finally:
        conn.close()


# ── PDF helpers ───────────────────────────────────────────────────────────────

def _extract_pages(pdf_bytes: bytes) -> dict:
    """Return {page_number: text} for pages with at least MIN_PAGE_CHARS of text."""
    page_texts = {}
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        for page_num, page in enumerate(doc, start=1):
            text = page.get_text().strip()
            if len(text) >= MIN_PAGE_CHARS:
                page_texts[page_num] = text
    return page_texts


def _chunk_pages(page_texts: dict) -> list:
    """
    Split each page into overlapping chunks.
    RecursiveCharacterTextSplitter splits on paragraphs/sentences first,
    so chunks contain coherent prose rather than arbitrary character slices.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
    )
    all_chunks = []
    global_index = 0
    for page_num, text in sorted(page_texts.items()):
        for chunk_text in splitter.split_text(text):
            all_chunks.append({
                "content": chunk_text,
                "chunk_index": global_index,
                "page_number": page_num,
            })
            global_index += 1
    return all_chunks


def _embed(texts: list) -> list:
    """Embed texts in batches of 100 to stay within OpenAI per-request limits."""
    if not texts:
        return []
    client = _get_openai()
    all_embeddings = []
    for i in range(0, len(texts), 100):
        batch = texts[i:i + 100]
        response = client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        all_embeddings.extend([item.embedding for item in response.data])
        logger.info(f"  Embedded batch {i // 100 + 1}: {response.usage.total_tokens} tokens")
    return all_embeddings


# ── DB helpers ────────────────────────────────────────────────────────────────

def _update_status(conn, doc_id: str, status: str, processed_at=None):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE documents SET status = %s, processed_at = %s WHERE id = %s",
            (status, processed_at, doc_id),
        )
    conn.commit()


def _insert_chunks(conn, doc_id: str, chunks: list):
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO chunks (document_id, content, chunk_index, page_number, embedding)
            VALUES (%s, %s, %s, %s, %s)
            """,
            [
                (doc_id, c["content"], c["chunk_index"], c["page_number"], c["embedding"])
                for c in chunks
            ],
        )
    conn.commit()
