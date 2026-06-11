-- Enable pgvector extension (provides the vector type)
CREATE EXTENSION IF NOT EXISTS vector;

-- documents table: one row per uploaded PDF
CREATE TABLE IF NOT EXISTS documents (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    filename    TEXT        NOT NULL,
    s3_key      TEXT        NOT NULL,          -- e.g. documents/{id}/{filename}
    file_size   INTEGER,                        -- bytes
    status      TEXT        DEFAULT 'uploaded', -- uploaded | processing | processed | failed
    created_at  TIMESTAMP   DEFAULT NOW(),
    processed_at TIMESTAMP                      -- set when processing completes
);

-- chunks table: one row per text chunk extracted from a PDF
CREATE TABLE IF NOT EXISTS chunks (
    id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id  UUID     REFERENCES documents(id) ON DELETE CASCADE,
    content      TEXT     NOT NULL,
    chunk_index  INTEGER  NOT NULL,             -- position within the document
    page_number  INTEGER,                        -- PDF page the chunk came from
    embedding    vector(1536),                   -- OpenAI text-embedding-3-small dimension
    created_at   TIMESTAMP DEFAULT NOW()
);

-- IVFFlat index speeds up approximate nearest-neighbour cosine searches.
-- lists=100 is a good starting point for up to ~1M vectors.
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
    ON chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Plain B-tree index for fast "all chunks for document X" lookups
CREATE INDEX IF NOT EXISTS chunks_document_idx
    ON chunks(document_id);
