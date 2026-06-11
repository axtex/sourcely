"""
services/processor.py — PDF ingestion pipeline.

Stages: download → extract text → chunk → embed → store → mark processed.

PyMuPDF (imported as fitz) is used for text extraction because it handles
complex PDF layouts better than pdfminer and is significantly faster.

LangChain's RecursiveCharacterTextSplitter splits on natural boundaries
(paragraphs, sentences, words) so chunks contain coherent sentences rather
than arbitrary character slices.
"""

import logging
from datetime import datetime, timezone

import fitz  # PyMuPDF

from langchain_text_splitters import RecursiveCharacterTextSplitter

from db import get_connection, insert_chunks, update_document_status
from services.storage import download_from_s3
from services.embeddings import generate_embeddings

logger = logging.getLogger(__name__)

# ── Chunking config ──────────────────────────────────────────────────────────
CHUNK_SIZE = 500       # characters per chunk
CHUNK_OVERLAP = 50     # overlap ensures context isn't lost at chunk boundaries
MIN_PAGE_CHARS = 50    # skip pages that are mostly images or blank


def process_document(document_id: str, s3_key: str):
    """
    Full ingestion pipeline for one document.

    Called synchronously from the upload endpoint (day 1).
    Day 2 will move this to an async Lambda invocation.
    """
    conn = get_connection()

    try:
        # ── Step 1: mark as processing ────────────────────────────────────────
        update_document_status(conn, document_id, "processing")
        logger.info(f"[{document_id}] Starting processing pipeline")

        # ── Step 2: download PDF bytes from S3 ───────────────────────────────
        logger.info(f"[{document_id}] Downloading from S3: {s3_key}")
        pdf_bytes = download_from_s3(s3_key)

        # ── Step 3: extract text page-by-page with PyMuPDF ───────────────────
        logger.info(f"[{document_id}] Extracting text from PDF")
        page_texts = _extract_pages(pdf_bytes)
        total_chars = sum(len(t) for t in page_texts.values())
        logger.info(
            f"[{document_id}] Extracted {total_chars:,} chars "
            f"from {len(page_texts)} non-blank pages"
        )

        # ── Step 4: chunk each page's text ───────────────────────────────────
        logger.info(f"[{document_id}] Chunking text")
        raw_chunks = _chunk_pages(page_texts)
        logger.info(f"[{document_id}] Created {len(raw_chunks)} chunks")

        # ── Step 5: generate embeddings ───────────────────────────────────────
        texts = [c["content"] for c in raw_chunks]
        logger.info(f"[{document_id}] Embedding {len(texts)} chunks...")
        embeddings = generate_embeddings(texts)

        # Attach each embedding to its chunk dict
        for chunk, emb in zip(raw_chunks, embeddings):
            chunk["embedding"] = emb

        # ── Step 6: persist to DB ─────────────────────────────────────────────
        logger.info(f"[{document_id}] Inserting chunks into database")
        insert_chunks(conn, document_id, raw_chunks)

        # ── Step 7: mark processed ────────────────────────────────────────────
        update_document_status(
            conn,
            document_id,
            "processed",
            processed_at=datetime.now(timezone.utc),
        )
        logger.info(f"[{document_id}] Processing complete ✓")

    except Exception as e:
        # If anything fails, record the error so the UI can show "failed"
        logger.error(f"[{document_id}] Processing failed: {e}", exc_info=True)
        try:
            update_document_status(conn, document_id, "failed")
        except Exception:
            pass  # don't mask the original error
        raise

    finally:
        conn.close()


def _extract_pages(pdf_bytes: bytes) -> dict[int, str]:
    """
    Extract text from each page of a PDF.

    Returns a dict of {page_number (1-indexed): text}.
    Pages with fewer than MIN_PAGE_CHARS of text are skipped
    (they're usually blank pages or scanned images with no OCR layer).
    """
    page_texts: dict[int, str] = {}

    # fitz.open() can accept raw bytes directly
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        for page_num, page in enumerate(doc, start=1):
            text = page.get_text().strip()
            if len(text) >= MIN_PAGE_CHARS:
                page_texts[page_num] = text

    return page_texts


def _chunk_pages(page_texts: dict[int, str]) -> list[dict]:
    """
    Split each page's text into overlapping chunks using LangChain.

    RecursiveCharacterTextSplitter tries to split on paragraph breaks first,
    then sentence boundaries, then words — giving more natural chunk boundaries
    than a naive fixed-size split.

    Returns a list of dicts: {content, chunk_index, page_number}
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
    )

    all_chunks: list[dict] = []
    global_index = 0  # unique position across the whole document

    for page_num, text in sorted(page_texts.items()):
        page_chunks = splitter.split_text(text)
        for chunk_text in page_chunks:
            all_chunks.append(
                {
                    "content": chunk_text,
                    "chunk_index": global_index,
                    "page_number": page_num,
                }
            )
            global_index += 1

    return all_chunks
