"""
routers/documents.py — CRUD endpoints for PDF documents.

Upload flow (Day 2 — async):
  1. Validate file (PDF, ≤20 MB)
  2. Upload raw bytes to S3
  3. Insert document record in DB (status=uploaded)
  4. Return immediately — Lambda picks up the S3 event and processes async
  5. Frontend polls GET /documents/{id}/status every 3 s until terminal state

Day 1 had step 4 call process_document() synchronously; that call is removed here.
"""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

import db as database
from services.storage import delete_from_s3, upload_to_s3

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
    Accept a PDF, upload to S3, create a DB record, and return immediately.

    Processing is handled asynchronously by the Lambda function which is
    triggered by the S3 ObjectCreated event — no waiting here.
    """
    # 1. Validate file type
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # 2. Read bytes and enforce size limit
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds the 20 MB limit ({len(file_bytes) // 1024 // 1024} MB uploaded).",
        )

    # 3. Create DB record first to get an ID for the S3 key
    doc_id = database.insert_document(
        conn,
        filename=file.filename,
        s3_key="pending",
        file_size=len(file_bytes),
    )

    # 4. Upload to S3 — this also triggers the Lambda via the bucket event rule
    try:
        s3_key = upload_to_s3(file_bytes, file.filename, doc_id)
    except Exception as e:
        logger.error(f"S3 upload failed: {e}")
        database.delete_document(conn, doc_id)
        raise HTTPException(status_code=500, detail="File upload to storage failed.")

    # 5. Persist the real S3 key
    with conn.cursor() as cur:
        cur.execute("UPDATE documents SET s3_key = %s WHERE id = %s", (s3_key, doc_id))
    conn.commit()

    # 6. Return immediately — Lambda will update status to processing → processed
    doc = database.get_document(conn, doc_id)
    return _serialize_document(doc)


# ── Status polling ────────────────────────────────────────────────────────────

@router.get("/{doc_id}/status")
def get_document_status(doc_id: str, conn=Depends(database.get_db)):
    """
    Lightweight status endpoint polled by the frontend every 3 seconds.

    Returns only the fields the frontend needs to update the badge — avoids
    re-fetching the full document list on every poll tick.
    """
    doc = database.get_document(conn, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return {
        "id": doc["id"],
        "status": doc["status"],
        "chunk_count": doc.get("chunk_count", 0),
        "processed_at": doc["processed_at"].isoformat() if doc.get("processed_at") else None,
    }


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

    try:
        delete_from_s3(doc["s3_key"])
    except Exception as e:
        logger.warning(f"S3 delete failed for {doc_id} ({doc['s3_key']}): {e}")

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
