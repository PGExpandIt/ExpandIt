# vallus kChat API

A small service that relays a message from the website into an **Infomaniak kChat**
channel. The website calls it; the webhook URL (or bot token) never leaves this
service.

Runs on **Bunny Edge Scripting** (Deno) in production and under Node locally - the
same entry point for both, via `@bunny.net/edgescript-sdk`. Node 20.6 or newer for
local work. It is the sibling of `booking-api` and shares its shape, anti-abuse
stack and deployment.

```
browser  ──GET  /config ──►  kchat-api   ──►  <org>.kchat.infomaniak.com
         ──POST /message──►   (secret here)    /hooks/<id>   (incoming webhook)
```

## Why a service at all

The website is a static export on a CDN, so it has no server of its own. A kChat
incoming-webhook URL (or a bot token) lets its holder post into the channel, so it
cannot be shipped to the browser. Anything that posts to kChat has to run somewhere
you control. That is this.

## Layout

| | |
|---|---|
| `src/kchat.ts` | the kChat client - webhook or bot-token transport, only `fetch` |
| `src/challenge.ts` | proof-of-work challenge (identical to booking-api) |
| `src/handler.ts` | the whole API as one `Request` → `Response` function |
| `src/config.ts` | environment → `Config`; validates a transport is configured |
| `src/edge.ts` | entry point; serves on the edge, or locally when `PORT` is set |
| `src/probe.ts` | local CLI: send one real test message, never deployed |

## Transports

Pick one in `.env`:

- **Incoming webhook (default, recommended).** In kChat: *Product menu →
  Integrations → Incoming Webhooks → Add*, pick the channel, copy the URL
  (`https://<org>.kchat.infomaniak.com/hooks/<id>`) into `KCHAT_WEBHOOK_URL`. One
  secret, no channel-id lookup. kChat honours the Mattermost webhook contract:
  `{ text, channel?, username?, icon_emoji? }`.
- **Bot / personal-access token.** Leave the webhook empty and set `KCHAT_API_BASE`,
  `KCHAT_TOKEN` and `KCHAT_CHANNEL_ID`. Posts to `/api/v4/posts` as the token's own
  identity.

`config.ts` refuses to start unless one of the two is fully configured.

## Setup

1. Create a webhook (above) or a bot token.
2. `cp .env.example .env` and fill in `KCHAT_WEBHOOK_URL` (or the token trio).
3. `npm install && npm run build`.
4. `npm run probe` - sends one test message; check it lands in the channel.
5. `npm start` - local server on `PORT` (default 8788).

**Deploying to Bunny Edge Scripting is identical to booking-api** - see
[`../booking-api/DEPLOY-BUNNY.pl.md`](../booking-api/DEPLOY-BUNNY.pl.md). In short:
`npm run deploy` builds the bundle (`dist/bundle.js`) and pushes it; set the same
environment variables as secrets in the Bunny script settings.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness; reports the active transport. |
| `GET` | `/config` | Hands out the message-length cap and, if a secret is set, a proof-of-work challenge to solve before posting. |
| `POST` | `/message` | Relays a message. Body: `{ message, name?, email?, subject?, website?, challenge?, solution? }`. |

`POST /message` returns `{ ok: true, transport }` on success, or `400`
(`invalid_message` / `invalid_email` / `bad_request`), `403` (`challenge_failed`),
`429` (`rate_limited`), `502` (`upstream_error`).

## Anti-abuse (same model as booking-api)

- **CORS allowlist** - only exact `ALLOWED_ORIGINS` may call it; no wildcards.
- **Honeypot** - a hidden `website` field; when filled, the API answers `ok` and
  relays nothing.
- **Proof-of-work challenge** - `GET /config` issues a signed challenge the browser
  must solve; unset `KCHAT_CHALLENGE_SECRET` to disable it. See `challenge.ts`.
- **Per-IP rate limit** - best-effort at the edge (`KCHAT_RATE_LIMIT_PER_HOUR`).
  A wrong OTP code is refunded rather than charged against it; see below.
- **Mention defanging** - `@channel` / `@here` / `@all` / `@user` in submitted text
  are neutralised so a visitor cannot ping the team through the relay.

## OTP e-mail verification (optional)

Set `KCHAT_OTP_SECRET`, `KCHAT_MAILER_URL` and `KCHAT_MAILER_SECRET` (see
`../mailer`) and the endpoints require a verified e-mail before anything reaches
the channel:

```
browser ──POST /request-code {email}──►  edge issues a code, calls the mailer,
                                          returns a signed token (not the code)
        ── user reads the code from the inbox ──
browser ──POST /message|/register {…, code, token}──►  verified → relayed to kChat
```

- The code is **stateless** like the proof-of-work: `token = base64url({expiry}).HMAC(secret, email.code.expiry)`.
  The code travels only by e-mail; the token is safe to show in the browser.
  Single-use, short-lived, with a per-token guess cap (5 wrong codes).
- **A mistyped code does not spend the per-IP budget.** Guessing is bounded by the
  per-token cap, so charging typos to the IP limit as well would only mean the
  looser limit ran out first: with the default `KCHAT_RATE_LIMIT_PER_HOUR=5` a
  visitor fumbling six digits from their inbox got `rate_limited` - the wrong
  problem, for an hour - before the OTP cap ever applied. Only `wrong_code` is
  refunded; `malformed`, `expired` and `too_many` still cost a slot, so posting junk
  without a real token is cut off as before. `/request-code` is charged normally,
  which caps a single IP at roughly 25 guesses an hour against a six-digit space.
- Proof-of-work still gates **`/request-code`** (the e-mail-send step); OTP gates
  the **post**. With OTP on, the message endpoints no longer ask for the challenge.
- Leave any of the three vars unset and OTP is off: `/request-code` returns 404 and
  the message endpoints fall back to the proof-of-work challenge. The edge **never**
  opens SMTP - it only calls the mailer over HTTP.

## Tests

```
npm test
```

Covers the challenge (accept/expire/replay/tamper) and the handler (validation,
honeypot, mention defanging, truncation, rate limit and its OTP refund, challenge
gate, routing) with a fake kChat client - no network, no real channel touched.

## What never reaches the browser

The webhook URL and the bot token stay in this service's environment. Upstream
errors are logged with detail but answered to the caller as a generic `502`; the
webhook URL is redacted to its host even in the logs.
