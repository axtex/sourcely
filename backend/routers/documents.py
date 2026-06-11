"""
routers/documents.py — CRUD endpoints for PDF documents.

Upload flow:
  1. Validate file (PDF, ≤20 MB)
  2. Upload raw bytes to S3
  3. Insert document record in DB (status=uploaded)
  4. Run processing pipeline synchronously (day 2: async via Lambda)
  5. Return the created document
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

import db as database
from services.storage import delete_from_s3, upload_to_s3
from services.processor import process_document

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    conn=Depends(database.get_db),
):
    """
    Accept a PDF, upload it to S3, create a DB record, and process it.

    Returns the newly created document row.
    """
    # 1. Validate file type — check both MIME type and filename extension
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # 2. Read file bytes and enforce size limit
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds the 20 MB limit ({len(file_bytes) // 1024 // 1024} MB uploaded).",
        )

    # 3. Create DB record first so we have an ID for the S3 key
    #    We use a placeholder s3_key and update it after upload
    doc_id = database.insert_document(
        conn,
        filename=file.filename,
        s3_key="pending",  # overwritten below
        file_size=len(file_bytes),
    )

    # 4. Upload to S3 — key includes the document ID for easy lookup
    try:
        s3_key = upload_to_s3(file_bytes, file.filename, doc_id)
    except Exception as e:
        logger.error(f"S3 upload failed: {e}")
        # Clean up the orphaned DB record
        database.delete_document(conn, doc_id)
        raise HTTPException(status_code=500, detail="File upload to storage failed.")

    # 5. Update the DB record with the real S3 key
    with conn.cursor() as cur:
        cur.execute("UPDATE documents SET s3_key = %s WHERE id = %s", (s3_key, doc_id))
    conn.commit()

    # 6. Process synchronously (extract text, embed, store chunks)
    #    This blocks the request but keeps day-1 simple.
    #    Day 2 will replace this with an async Lambda invocation.
    try:
        process_document(doc_id, s3_key)
    except Exception as e:
        logger.error(f"Processing failed for {doc_id}: {e}")
        # Don't raise — the document was uploaded; client can see status=failed

    # 7. Return the final document state
    doc = database.get_document(conn, doc_id)
    return _serialize_document(doc)


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("")
def list_documents(conn=Depends(database.get_db)):
    """Return all documents ordered by upload date (newest first)."""
    docs = database.get_documents(conn)
    return [_serialize_document(d) for d in docs]


# ── Get one ───────────────────────────────────────────────────────────────────

@router.get("/{doc_id}")
def get_document(doc_id: str, conn=Depends(database.get_db)):
    """Return a single document by ID, including its chunk count."""
    doc = database.get_document(conn, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return _serialize_document(doc)


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{doc_id}")
def delete_document(doc_id: str, conn=Depends(database.get_db)):
    """Delete a document from the DB (chunks cascade) and from S3."""
    doc = database.get_document(conn, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Delete from S3 first; if it fails, we don't touch the DB
    try:
        delete_from_s3(doc["s3_key"])
    except Exception as e:
        logger.warning(f"S3 delete failed for {doc_id} ({doc['s3_key']}): {e}")
        # Proceed with DB deletion anyway — S3 objects can be cleaned up later

    database.delete_document(conn, doc_id)
    return {"success": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize_document(doc: dict) -> dict:
    """Convert datetime objects to ISO strings for JSON serialisation."""
    return {
        "id": doc["id"],
        "filename": doc["filename"],
        "file_size": doc["file_size"],
        "status": doc["status"],
        "chunk_count": doc.get("chunk_count", 0),
        "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
        "processed_at": doc["processed_at"].isoformat() if doc.get("processed_at") else None,
    }
