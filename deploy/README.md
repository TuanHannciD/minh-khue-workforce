# MKW production packaging

This directory is the image/Compose boundary for the independent `mkw` project.
It does not share networks, volumes, ports, or containers with FormAuto Hub,
Cashback, or Sellerflow.

## Local validation

```bash
cp deploy/shared/db.env.example deploy/shared/db.env
cp deploy/shared/api.env.example deploy/shared/api.env
MKW_API_IMAGE=example/api MKW_WEB_IMAGE=example/web \
  docker compose -f deploy/compose.production.yml config --quiet
rm deploy/shared/db.env deploy/shared/api.env
```

The real files are created by the approved server bootstrap and are never
committed. Replace all `REPLACE_ON_SERVER` values before bootstrap. Images must
be immutable registry digests; mutable tags are rejected by the release plan.

The gateway is the only host binding: `127.0.0.1:3200` to the web image's
port 8080. It proxies `/api/*` to the API and serves the SPA. PostgreSQL and
the API are reachable only on the internal `mkw-internal` network.

The API defaults to loopback for local development. Production sets
`HOST=0.0.0.0` in Compose so the internal gateway can reach it.

## Zero-touch server setup

The protected GitHub Environment is `production`. Set these variables there
before running a workflow; do not put passwords or tokens in the repository:

```text
MKW_SSH_HOST=113.184.16.191
MKW_SSH_PORT=1122
MKW_SSH_HOST_FINGERPRINT=<verified SHA256 fingerprint>
MKW_DEPLOY_PATH=/home/deploy/mkw
MKW_PROJECT_NAME=mkw
MKW_GATEWAY_PORT=3200
MKW_COMPOSE_SOURCE=deploy/compose.production.yml
MKW_MANIFEST_SOURCE=deploy/release.manifest
```

Store the private SSH key as `MKW_SSH_PRIVATE_KEY`. The workflow pins the
server host key and accepts only a full 40-character commit SHA. It never
prints the key or runtime secrets.

Run modes in this order:

1. `dry-run` checks Docker, Compose, `/home` capacity, port ownership and
   deployment identity. It creates nothing.
2. `bootstrap` creates `/home/deploy/mkw` and generates `shared/db.env` and
   `shared/api.env` using the server CSPRNG when both are absent. Existing
   files are preserved. They are mode `0600` and values are never printed.
3. An approved backup job must create `/home/deploy/mkw/shared/backup.ready` only
   after a real backup and integrity check. The release gate refuses to run
   without this marker; bootstrap does not fabricate it.
4. `release` uploads the Compose file and immutable manifest, validates the
   digest, reconciles the `mkw` project, waits for health and performs a
   gateway smoke check. It writes a JSON receipt under `receipts/`.

The approved PostgreSQL image is pinned in `deploy/postgres-image.env`; build
and release workflows reuse that exact digest and do not resolve a mutable
`postgres:17-alpine` tag during CI. The manifest must contain exactly one
immutable reference for each image used by Compose: `MKW_API_IMAGE`,
`MKW_WEB_IMAGE`, and `MKW_POSTGRES_IMAGE`, each in the form
`registry/name@sha256:<64 hex digits>`. Never replace these with `latest`.
Cloudflare can later point a domain
to the existing tunnel origin `http://127.0.0.1:3200`; no application secret
or Compose change is needed for that DNS attachment.
