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
| `POST` | `/send-license` | Signs a free-tier licence for `company` and mails it. Body `{ email, company }`, same signature. `404` unless `FREE_LICENSE_KEY_B64` is set. |

Returns `{ ok: true }` (`/send-license`: `{ ok: true, expires }`, never the key), or
`401 bad_signature`, `400 invalid_email` / `invalid_code` / `invalid_company`,
`429 rate_limited`, `502 send_failed`.

## Free licences

`/send-license` signs with the **free** key (`free-private.pem` from
`playwrightRunner-license-gen`), never the main one. Both runners hold a key signed
with it to the free tier - 2 users, 1 project, one run at a time, no gated
integrations - whatever its payload says, and reject one expiring more than 190 days
out. So a leak of this key costs a free licence, which the website hands out anyway.

The payload is the generator's free preset, expiring after `FREE_LICENSE_TERM_DAYS`
(183). The company name is signed byte for byte as the edge sends it: the key only
works with that exact string. The edge calls this only after the visitor proved the
e-mail with a one-time code; codes and licences share the per-recipient rate limit.

The e-mail carries download links for the current release, read at send time from
`latest.json` on `DOWNLOADS_URL` (default `https://downloads.vallus.eu`) and reused
for five minutes. Only links on that host are mailed. When it cannot be read the
e-mail still goes out, linking the downloads page (`DOWNLOADS_URL/`) instead.

**One licence per organisation.** Every issued key is recorded in
`LICENSE_LEDGER_PATH` (JSON lines: company, normalised company, e-mail, domain,
expiry - never the key), and each request is checked against it first:

| Request | Answer |
|---|---|
| Personal or disposable mailbox (gmail.com, wp.pl, mailinator.com...) | `409 manual_review` `personal_email` - no key |
| Same e-mail domain or address, licence still valid | the **same** key again, `reissued: true` |
| Same company name (case, accents, punctuation and legal form ignored) from another domain | `409 manual_review` `company_has_licence` - no key |
| Within 14 days of expiry, or expired | a new licence |

The existing key is not stored: RSA PKCS#1 v1.5 signatures are deterministic, so the
recorded company and expiry sign to the same key again. The edge turns a `409` into a
request answered by hand. Requests are serialised, so two arriving together cannot
both be issued a key. One mailer instance only - the ledger is a file.

Configuration fails at startup, not on the first request, when the key does not
decode to an RSA private key, the term exceeds 190 days, or
`FREE_LICENSE_MIN_VERSION` is missing.

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
