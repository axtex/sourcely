# sourcely

**RAG-powered document Q&A with cited source passages.**

Upload a PDF. Ask a question. Get an answer with verbatim passages from the document cited inline — not hallucinated, pulled directly from the text.


**Live at:** https://sourcely-black.vercel.app  

---

## Why it exists

Most “chat with your PDF” tools return an answer and ask you to trust it. If the model invents a citation — or skips one — you have no way to check. Sourcely only answers from retrieved chunks and shows the verbatim passages plus a similarity score, so you can see exactly what the model used. I built it to learn a production-shaped RAG pipeline (async ingest, vector search, grounded generation) rather than a single-process demo.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind v4 |
| Backend | FastAPI (Python) |
| Embeddings | OpenAI `text-embedding-3-small` |
| LLM | Claude Haiku (`claude-haiku-4-5-20251001`) |
| Chunking | LangChain text splitters |
| Vector store | PostgreSQL + pgvector |
| File storage | AWS S3 |
| Async processing | AWS Lambda (triggered on S3 upload) |
| Deployment | Vercel (frontend) + Railway (API) + AWS (S3, Lambda) |

---

## What it does

**For the user**

- **Upload** — drag a PDF into the left panel (PDF only, max 20 MB); it lands in S3 and starts processing in the background
- **Track status** — each file shows a live badge: *uploaded → processing → processed* (or *failed*), no page refresh
- **Scope a question** — ask across all documents, or click one file to query just that PDF
- **Cited answer** — Claude answers from the retrieved passages; expand **show N sources** to read the verbatim quotes
- **Source cards** — dark, monospace blocks with page number and similarity % so citations look quoted, not generated
- **Manage files** — delete a document with an inline confirm (chunks go with it)

---

## Technical highlights

- S3 upload triggers a Lambda that extracts text (PyMuPDF), chunks with a 512-token sliding window, embeds with `text-embedding-3-small`, and writes vectors to pgvector
- Query path embeds the question, cosine-searches the top-5 chunks, then calls Claude Haiku with those passages as the only context
- The UI polls `GET /documents/{id}/status` with exponential backoff (3s → 10s) while a doc is in-flight
- Retrieval and generation are separate models, so either side can be swapped without rewriting the other

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

## Getting started

**Prerequisites:** Docker Desktop, Python 3.10+, Node 18+, and API keys for [OpenAI](https://platform.openai.com) and [Anthropic](https://console.anthropic.com). PDF upload also needs an AWS account with an S3 bucket and the `sourcely-processor` Lambda (query-only works without AWS).

```bash
git clone https://github.com/axtex/sourcely.git
cd sourcely
```

```bash
# Backend env
cp backend/.env.example backend/.env
# set OPENAI_API_KEY and ANTHROPIC_API_KEY
# set AWS_* if you want uploads (S3 + Lambda)

# Frontend env
cp frontend/.env.example frontend/.env.local
# VITE_API_URL=http://localhost:8000
```

```bash
# Database (pgvector/pg16 — db/user/password: sourcely)
make dev-db

# API — http://localhost:8000
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
make dev-back

# UI — http://localhost:5173
cd frontend
npm install
cd ..
make dev-front
```

Open http://localhost:5173, drop a short PDF, wait for **processed**, then ask a question.

---

