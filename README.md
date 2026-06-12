# Sourcely

**RAG-powered document Q&A with cited source passages.**

Upload a PDF. Ask a question. Get an answer with verbatim passages from the document cited inline — not hallucinated, pulled directly from the text.

Live: [sourcely-black.vercel.app](https://sourcely-black.vercel.app)

---

## What it does

1. **Upload** — drag a PDF into the left panel; the file goes to S3 and a background Lambda job chunks and embeds it
2. **Index** — each chunk is embedded with `text-embedding-3-small` and stored in PostgreSQL with pgvector
3. **Query** — your question is embedded, the closest chunks are retrieved by cosine similarity, and Claude Haiku synthesises an answer grounded in those passages
4. **Cite** — the UI shows exactly which passages from the document were used, ranked by similarity score

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind v4 |
| Backend | FastAPI (Python) |
| Embeddings | OpenAI `text-embedding-3-small` |
| LLM | Claude Haiku (`claude-haiku-4-5-20251001`) |
| Vector store | PostgreSQL + pgvector |
| File storage | AWS S3 |
| Async processing | AWS Lambda (triggered on S3 upload) |
| Deployment | Vercel (frontend) + AWS (backend + infra) |

---

## Architecture

```
Browser
  │
  ├─ POST /documents/upload ──► FastAPI ──► S3 (store PDF)
  │                                  └──► DB (status = "uploaded")
  │
  │   S3 trigger
  │        └──► Lambda
  │               ├── extract text (PyMuPDF)
  │               ├── chunk (512-token sliding window)
  │               ├── embed  (OpenAI text-embedding-3-small)
  │               └── store chunks + vectors in pgvector
  │
  └─ POST /query ──► FastAPI
                       ├── embed question  (OpenAI)
                       ├── cosine search   (pgvector, top-k=5)
                       └── generate answer (Claude Haiku, passages as context)
```

The frontend polls `GET /documents/{id}/status` every 3 seconds while a document is in-flight, so the status badge updates from *uploaded → processing → processed* without a page refresh.

---

## Design decisions

**Why two models?**
OpenAI embeddings (`text-embedding-3-small`) offer strong retrieval quality at low cost. Claude Haiku handles the generation step — grounded in the retrieved passages — which keeps answers factual and citation-ready. The two-model approach separates *retrieval quality* from *generation quality* and lets you swap either independently.

**Why pgvector instead of a dedicated vector DB?**
pgvector keeps the entire stack in one database. For this scale (PDFs in the tens to hundreds), the operational overhead of Pinecone/Weaviate isn't justified. A single `CREATE INDEX USING hnsw` gives sub-10ms similarity search.

**Why async Lambda processing?**
Chunking and embedding a 20-page PDF takes 5–15 seconds — too long for a synchronous HTTP response. The Lambda triggered by S3 upload handles processing out-of-band, and the frontend polls status until the doc is ready.

**Why dark source blocks?**
Source passages are verbatim quoted text, not generated prose. Styling them like code blocks (dark surface, monospace font) signals to the reader: *this came directly from the document, not from the model*. The visual distinction matters for trust.

---

## Project structure

```
sourcely/
├── backend/
│   ├── main.py          # FastAPI app, routes
│   ├── models.py        # SQLAlchemy models (Document, Chunk)
│   ├── database.py      # DB session + pgvector setup
│   ├── embeddings.py    # OpenAI embedding wrapper
│   ├── rag.py           # Retrieval + Claude generation
│   └── lambda/          # AWS Lambda handler for async processing
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Root layout (top bar + 35/65 split)
│   │   └── components/
│   │       ├── Upload.tsx       # Drag-and-drop PDF uploader
│   │       ├── DocumentList.tsx # Sidebar list with status polling
│   │       ├── Chat.tsx         # Q&A interface with source toggle
│   │       └── SourceCard.tsx   # Dark-surface source passage block
│   └── index.css        # Design tokens + Tailwind v4 config
│
└── docker-compose.yml   # PostgreSQL + pgvector
```
