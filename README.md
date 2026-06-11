# Sourcely

RAG-powered document Q&A with cited sources.

**Stack:** React + TypeScript + Tailwind · FastAPI · LangChain · OpenAI embeddings · Claude Haiku · PostgreSQL + pgvector · AWS S3

## Quick start

1. Clone the repo

2. Fill in API keys:
   ```
   cp backend/.env.example backend/.env
   # edit backend/.env with your keys
   ```

3. Start the database:
   ```
   docker compose up -d
   ```

4. Run the backend:
   ```
   cd backend
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

5. Run the frontend:
   ```
   cd frontend
   npm install
   npm run dev
   ```

6. Open [http://localhost:5173](http://localhost:5173)

## Usage

1. Upload a PDF using the left panel
2. Wait for the status badge to turn **processed** (embedding takes a few seconds)
3. Type a question in the chat panel
4. The answer cites passage numbers — click "Show sources" to see them

## Architecture

```
Browser → FastAPI → S3 (store PDF)
                  → PostgreSQL/pgvector (store chunks + embeddings)
                  → OpenAI (embed question)
                  → pgvector similarity search
                  → Claude Haiku (generate cited answer)
```

## Environment variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | For text-embedding-3-small |
| `ANTHROPIC_API_KEY` | For Claude Haiku |
| `AWS_PROFILE` | AWS CLI profile name (`sourcely`) |
| `AWS_S3_BUCKET` | S3 bucket for PDFs (`sourcely-axtex-bucket`) |
| `AWS_REGION` | AWS region (`us-west-2`) |
| `DATABASE_URL` | PostgreSQL connection string |
