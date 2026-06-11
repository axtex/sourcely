.PHONY: dev-db dev-back dev-front stop

# Start the PostgreSQL container in the background
dev-db:
	docker compose up -d

# Start the FastAPI backend with hot-reload
dev-back:
	cd backend && uvicorn main:app --reload

# Start the Vite frontend dev server
dev-front:
	cd frontend && npm run dev

# Stop all Docker containers
stop:
	docker compose down
