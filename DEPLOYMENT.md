# Production deployment

This setup runs the application behind Caddy HTTPS using one public domain. Only
ports 80 and 443 are exposed. PostgreSQL, Qdrant, Backend, and AI remain inside
the Docker network.

## 1. Server requirements

- Ubuntu server with Docker Engine and Docker Compose v2
- Recommended: 8 vCPU, 16 GB RAM, and sufficient SSD storage
- A domain whose A/AAAA record points to the server
- Inbound ports 22, 80, and 443 allowed by the firewall

## 2. Configure secrets

```bash
cp .env.production.example .env.production
openssl rand -hex 32
```

Edit `.env.production` and replace every placeholder. Keep this file only on the
server; Git ignores it. If the PostgreSQL password contains reserved URL
characters, URL-encode it in `DATABASE_URL`.

## 3. Validate and start

The recommended command validates secrets, builds the images, waits for every
service, and runs the public smoke tests:

```bash
./deploy/deploy.sh
```

For manual operation or troubleshooting, run the underlying commands:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

The Backend automatically runs `alembic upgrade head` before starting. Caddy
requests and renews the TLS certificate after DNS and ports 80/443 are ready.

## 4. Verify

```bash
curl -I https://YOUR_DOMAIN
curl https://YOUR_DOMAIN/api/v1/auth/me
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 backend ai_service
```

The unauthenticated `/auth/me` request should return `401`, confirming that HTTPS,
the reverse proxy, and Backend routing work.

The smoke test can also be run independently, either from `.env.production` or
against an explicit URL:

```bash
./deploy/smoke-test.sh
./deploy/smoke-test.sh https://search.example.com
```

## 5. Operations

```bash
# Pull and deploy a new version
git pull --ff-only origin dev
./deploy/deploy.sh

# Follow logs
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f

# Stop without deleting persistent data
docker compose --env-file .env.production -f docker-compose.prod.yml down
```

Do not run `down -v` on a server with real data because it deletes PostgreSQL,
Qdrant, image, certificate, and model-cache volumes.
