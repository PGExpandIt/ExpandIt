# vallus mailer

A minimal HTTP → SMTP relay. It sends **one-time verification codes** as
`sales@vallus.eu` through **Infomaniak SMTP**. The kChat edge relay calls it over
HTTP; this service is the only place that opens an SMTP socket.

```
edge (kchat-api)  ──POST /send-code──►  mailer  ──SMTP :587──►  Infomaniak
   (signs body with            (verifies HMAC,           (from sales@vallus.eu)
    shared secret)              sends the code)
```

## Why a separate service

Bunny Edge Scripting **discourages sending e-mail directly** (it trips abuse
protection and risks account suspension), and Infomaniak has **no HTTP send API** -
transactional mail is SMTP only. SMTP needs a raw TCP socket, which the edge should
not open. So the send lives here, on a host that allows outbound TCP:587/465 (a
small VPS, your server, or Infomaniak's own hosting to keep everything in-house).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness. |
| `POST` | `/send-code` | Sends a code. Body `{ email, code }`; requires header `X-Signature` = HMAC-SHA256 of the raw body under `MAILER_AUTH_SECRET`. |

Returns `{ ok: true }`, or `401 bad_signature`, `400 invalid_email` / `invalid_code`,
`429 rate_limited`, `502 send_failed`.

## Security

- **HMAC-signed requests** - the mailer acts only on bodies signed with the shared
  secret, so a discovered URL cannot be used to send. There is no browser and no
  CORS here; the signature is the gate.
- **Per-recipient rate limit** - caps sends to one inbox per hour, so even a leaked
  secret cannot bomb an address.
- The mailbox password and shared secret live in env only, never in the repo.
- SMTP errors are logged with detail but returned to the caller as a generic `502`.

## Setup

1. `cp .env.example .env` - fill in the Infomaniak SMTP credentials for
   `sales@vallus.eu` and generate `MAILER_AUTH_SECRET` (same value goes on the edge
   as `KCHAT_MAILER_SECRET`).
2. `npm install && npm run build`.
3. `npm run probe you@example.com` - verifies the SMTP login and sends one real
   code. Check the inbox.
4. `npm start` - HTTP server on `PORT` (default 8790). Put it behind TLS / a reverse
   proxy, reachable by the edge; do not expose it publicly without need.

## The signature

`MAIL_SIGNATURE` is appended under the body, after the RFC 3676 `-- ` line, so
clients fold it and keep it out of quoted replies. `\n` in the value becomes a
line break; empty means no footer.

It has to be set here even though the mailbox already has one. A webmail
signature is applied by the webmail client as it composes; SMTP delivers exactly
the body it is handed, and Infomaniak exposes no API to read that signature back.
So it is copied, and copies drift - change one, change the other.

Plain text only. The code e-mail is a `text/plain` part, which is deliberate:
transactional mail with no HTML lands in fewer spam folders, and a footer with a
logo would mean carrying an HTML alternative for one line of branding.

## Deploying

Two supported shapes, same image:

- **One VPS** (`compose.yaml`) - the mailer plus Caddy for TLS. This is the cheaper
  option and the one to reach for unless a cluster already exists.
- **Kubernetes** (`k8s/`) - worth it only when the cluster is already paid for by
  other services; see `k8s/README.md`.

For the VPS, the full walkthrough - firewall, DNS, rsync, verification and the
operational notes - is [DEPLOY-VPS.pl.md](DEPLOY-VPS.pl.md). In short: point
`mailer.vallus.eu` at the server, fill `.env` (including `MAILER_DOMAIN` and
`ACME_EMAIL`), then

```
docker compose up -d --build
```

Caddy issues the certificate on first start and publishes exactly one route,
`POST /send-code`. Everything else - including `/health`, which serves the
container healthcheck - answers 404 from the proxy. The mailer itself is never
published to the host; only Caddy can reach it.

Verify the one thing the network can silently break:

```
docker compose exec mailer node dist/probe.js you@example.com
```

Outbound port 25 is blocked on Infomaniak VPS and Public Cloud; 587 (used here)
and 465 are not.

## Tests

```
npm test
```

Covers signature verification (accept / reject / tamper), validation, the
per-recipient rate limit and the SMTP-failure path, with a fake sender - no live
SMTP, no mail sent.
