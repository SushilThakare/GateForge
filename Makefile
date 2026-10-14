# =============================================================================
# Makefile — GateForge developer convenience commands.
#
# Run `make help` to list all available targets.
# All docker compose commands use the COMPOSE variable so you can override it:
#   COMPOSE="docker-compose" make dev   (if you're on an older Docker without the plugin)
# =============================================================================

COMPOSE         := docker compose
COMPOSE_DEV     := $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml

# Default target: show help.
.DEFAULT_GOAL := help

.PHONY: help dev prod build build-gateway build-worker build-dashboard \
        down down-volumes logs logs-gateway logs-worker logs-dashboard \
        test test-gateway migrate seed ps clean

# ── Help ──────────────────────────────────────────────────────────────────────
help: ## Show this help message
	@echo ""
	@echo "  ██████╗  █████╗ ████████╗███████╗███████╗ ██████╗ ██████╗  ██████╗ ███████╗"
	@echo "  ██╔════╝ ██╔══██╗╚══██╔══╝██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔════╝"
	@echo "  ██║  ███╗███████║   ██║   █████╗  █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  "
	@echo "  ██║   ██║██╔══██║   ██║   ██╔══╝  ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  "
	@echo "  ╚██████╔╝██║  ██║   ██║   ███████╗██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗"
	@echo "   ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝"
	@echo ""
	@echo "  Usage: make <target>"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ── Development ───────────────────────────────────────────────────────────────
dev: ## Start all services in development mode (hot-reload)
	$(COMPOSE_DEV) up --build

dev-detach: ## Start all services in development mode (background)
	$(COMPOSE_DEV) up --build -d

# ── Production ────────────────────────────────────────────────────────────────
prod: ## Start all services in production mode
	$(COMPOSE) up -d

# ── Build ─────────────────────────────────────────────────────────────────────
build: ## Build all service images (production)
	$(COMPOSE) build --parallel

build-gateway: ## Build only the gateway image
	$(COMPOSE) build gateway

build-worker: ## Build only the worker image
	$(COMPOSE) build worker

build-dashboard: ## Build only the dashboard image
	$(COMPOSE) build dashboard

# ── Tear Down ─────────────────────────────────────────────────────────────────
down: ## Stop and remove containers (data volumes preserved)
	$(COMPOSE) down

down-volumes: ## Stop and remove containers AND data volumes (destructive!)
	@echo "⚠️  This will DELETE all Postgres and Redis data. Are you sure? [y/N]"
	@read ans && [ $${ans:-N} = y ] && $(COMPOSE) down -v || echo "Aborted."

# ── Logs ──────────────────────────────────────────────────────────────────────
logs: ## Tail all service logs
	$(COMPOSE) logs -f

logs-gateway: ## Tail gateway logs only
	$(COMPOSE) logs -f gateway

logs-worker: ## Tail worker logs only
	$(COMPOSE) logs -f worker

logs-dashboard: ## Tail dashboard logs only
	$(COMPOSE) logs -f dashboard

logs-postgres: ## Tail postgres logs only
	$(COMPOSE) logs -f postgres

# ── Tests ─────────────────────────────────────────────────────────────────────
test: test-gateway ## Run all test suites

test-gateway: ## Run gateway unit & integration tests inside a container
	$(COMPOSE) run --rm \
		-e NODE_ENV=test \
		-e DATABASE_URL="postgresql://$${POSTGRES_USER:-gateforge_user}:$${POSTGRES_PASSWORD:-gateforge_password}@postgres:5432/$${POSTGRES_DB:-gateforge_db}?schema=public" \
		-e REDIS_URL="redis://redis:6379" \
		gateway \
		sh -c "npm test --workspace=packages/gateway"

# ── Database ──────────────────────────────────────────────────────────────────
migrate: ## Run Prisma migrations (applies any pending migrations)
	$(COMPOSE) run --rm migrate

seed: ## Seed the database with initial data
	$(COMPOSE) run --rm \
		-e DATABASE_URL="postgresql://$${POSTGRES_USER:-gateforge_user}:$${POSTGRES_PASSWORD:-gateforge_password}@postgres:5432/$${POSTGRES_DB:-gateforge_db}?schema=public" \
		gateway \
		sh -c "cd /app && npx prisma db seed"

# ── Status ────────────────────────────────────────────────────────────────────
ps: ## Show running container status
	$(COMPOSE) ps

# ── Cleanup ───────────────────────────────────────────────────────────────────
clean: ## Remove all stopped containers and dangling images
	docker system prune -f
	docker image prune -f
