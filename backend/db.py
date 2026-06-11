"""
db.py — Database connection and query helpers.

Uses psycopg2 (sync) with a simple connection-per-request pattern via
FastAPI's Depends() system. pgvector registers a custom adapter so that
Python lists are automatically serialised as vector literals.
"""

import os
import logging
from datetime import datetime
from typing import Generator, Optional

import psycopg2
import psycopg2.extras
from pgvector.psycopg2 import register_vector
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://sourcely:sourcely@localhost:5432/sourcely")


def get_connection():
    """Open a new psycopg2 connection and register the vector type adapter."""
    conn = psycopg2.connect(DATABASE_URL)
    # register_vector teaches psycopg2 how to serialise/deserialise pgvector values
    register_vector(conn)
    return conn


def get_db() -> Generator:
    """
    FastAPI dependency that yields one DB connection per request and
    ensures it is closed afterwards — even if the handler raises.
    """
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()


def test_connection() -> bool:
    """Smoke-test the DB on startup. Returns True if reachable."""
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.close()
        return True
    except Exception as e:
        logger.error(f"DB connection failed: {e}")
        return False


def init_schema() -> bool:
    """
    Apply init.sql on startup (idempotent — uses IF NOT EXISTS).

    Railway Postgres does not auto-run docker-entrypoint-initdb.d scripts,
    so fresh deployments need this before uploads or queries can work.
    """
    init_path = os.path.join(os.path.dirname(__file__), "init.sql")
    try:
        with open(init_path, encoding="utf-8") as f:
            sql = f.read()
        # Plain connection with autocommit — CREATE EXTENSION cannot run
        # inside a transaction; register_vector() would start one.
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.close()
        logger.info("✓ Database schema initialized")
        return True
    except Exception as e:
        logger.error(f"Schema initialization failed: {e}")
        return False


# ── Document helpers ──────────────────────────────────────────────────────────

def insert_document(conn, filename: str, s3_key: str, file_size: int) -> str:
    """Insert a new document record and return its generated UUID."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO documents (filename, s3_key, file_size)
            VALUES (%s, %s, %s)
            RETURNING id
            """,
            (filename, s3_key, file_size),
        )
        doc_id = str(cur.fetchone()[0])
    conn.commit()
    return doc_id


def update_document_status(
    conn,
    doc_id: str,
    status: str,
    processed_at: Optional[datetime] = None,
):
    """Update a document's status (and optionally processed_at timestamp)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE documents
            SET status = %s, processed_at = %s
            WHERE id = %s
            """,
            (status, processed_at, doc_id),
        )
    conn.commit()


def insert_chunks(conn, document_id: str, chunks: list[dict]):
    """
    Bulk-insert text chunks with embeddings.

    Each dict in `chunks` must have:
      content, chunk_index, page_number, embedding (list[float])
    """
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO chunks (document_id, content, chunk_index, page_number, embedding)
            VALUES (%s, %s, %s, %s, %s)
            """,
            [
                (
                    document_id,
                    c["content"],
                    c["chunk_index"],
                    c["page_number"],
                    c["embedding"],  # pgvector adapter handles the list → vector cast
                )
                for c in chunks
            ],
        )
    conn.commit()


def get_documents(conn) -> list[dict]:
    """Return all documents with their chunk counts, newest first."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
                d.id::text,
                d.filename,
                d.s3_key,
                d.file_size,
                d.status,
                d.created_at,
                d.processed_at,
                COUNT(c.id) AS chunk_count
            FROM documents d
            LEFT JOIN chunks c ON c.document_id = d.id
            GROUP BY d.id
            ORDER BY d.created_at DESC
            """
        )
        return [dict(row) for row in cur.fetchall()]


def get_document(conn, doc_id: str) -> Optional[dict]:
    """Return a single document with its chunk count, or None if not found."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
                d.id::text,
                d.filename,
                d.s3_key,
                d.file_size,
                d.status,
                d.created_at,
                d.processed_at,
                COUNT(c.id) AS chunk_count
            FROM documents d
            LEFT JOIN chunks c ON c.document_id = d.id
            WHERE d.id = %s
            GROUP BY d.id
            """,
            (doc_id,),
        )
        row = cur.fetchone()
        return dict(row) if row else None


def delete_document(conn, doc_id: str):
    """Delete a document (chunks cascade automatically via FK)."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM documents WHERE id = %s", (doc_id,))
    conn.commit()


def similarity_search(
    conn,
    query_embedding: list[float],
    document_id: Optional[str] = None,
    limit: int = 5,
) -> list[dict]:
    """
    Find the `limit` chunks whose embeddings are closest to query_embedding
    using cosine distance (1 - cosine_similarity).

    Returns dicts with: content, similarity, chunk_index, page_number, document_id
    """
    # <=> is the pgvector cosine-distance operator; lower = more similar
    # We convert distance to similarity: similarity = 1 - distance
    if document_id:
        sql = """
            SELECT
                content,
                1 - (embedding <=> %s::vector) AS similarity,
                chunk_index,
                page_number,
                document_id::text
            FROM chunks
            WHERE document_id = %s
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """
        params = (query_embedding, document_id, query_embedding, limit)
    else:
        sql = """
            SELECT
                content,
                1 - (embedding <=> %s::vector) AS similarity,
                chunk_index,
                page_number,
                document_id::text
            FROM chunks
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """
        params = (query_embedding, query_embedding, limit)

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        return [dict(row) for row in cur.fetchall()]
