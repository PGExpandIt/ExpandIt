# vallus booking API

A small service that shows real free slots from an Infomaniak (kSuite) calendar and books
them. The website calls it; the Infomaniak token never leaves this service.

Runs on **Bunny Edge Scripting** (Deno) in production and under Node locally — the same entry
point for both, via `@bunny.net/edgescript-sdk`. Node 20.6 or newer for local work.

```
browser  ──GET  /slots──►  booking-api  ──►  api.infomaniak.com
         ──POST /book ──►   (token here)      /1/calendar/pim/event
```

## Why a service at all

The website is a static export on a CDN, so it has no server of its own. The Infomaniak token
gives full read/write access to the calendar, so it cannot be shipped to the browser under any
circumstances. Anything that reads or writes the calendar has to run somewhere you control.
That is this.

## Layout

| | |
|---|---|
| `src/time.ts`, `src/slots.ts`, `src/infomaniak.ts` | the portable core — only `Intl`, `Date`, `fetch`, `URLSearchParams` |
| `src/handler.ts` | the whole API as one `Request` → `Response` function |
| `src/edge.ts` | entry point; serves on the edge, or locally when `PORT` is set |
| `src/probe.ts`, `src/cancel.ts` | local CLI tools, never deployed |

## Setup

**Deploying this to Bunny Edge Scripting, step by step: [DEPLOY-BUNNY.pl.md](DEPLOY-BUNNY.pl.md) (po polsku).**

The short version:

1. **Create a token** at <https://manager.infomaniak.com/v3/ng/accounts/token/list>. Scope
   `workspace:calendar`; `user_info` only if you leave `BOOKING_ORGANIZER_EMAIL` unset. Shown
   once — copy it.
2. `cp .env.example .env` and fill in `INFOMANIAK_TOKEN`.
3. `npm install && npm run build`
4. **Probe the account** before wiring anything up:

   ```bash
   npm run probe
   ```

   It lists your calendars, resolves the one that will be used, prints the raw JSON of the
   first event it finds, and shows the slots that would be offered. It only reads — it
   creates nothing. Check that the local times it prints match what you see in the
   Infomaniak web calendar, then put the calendar's id in `INFOMANIAK_CALENDAR_ID` so a new
   calendar appearing on the account cannot silently change the target.

5. `PORT=8787 npm start`, then `curl localhost:8787/slots`.
6. `npm run deploy` to push it to Bunny.

From the website directory, `npm run dev:all` starts both sides already wired together.

## Wiring the website to it

Set `BOOKING_API_ORIGIN` as a repository variable in the website's GitHub Actions settings; the
deploy workflow passes it to the build as `NEXT_PUBLIC_BOOKING_API`. Add the same origin to
`ALLOWED_ORIGINS` here — every origin the site answers on, since the match is exact and includes
the scheme.

The variable is read **at build time**, so changing it needs a rebuild of the site, not a restart
of this service. A site built without it looks perfectly normal and quietly books nothing.

Without that variable the website keeps its offline behaviour — the example calendar and a
`mailto:` request — and so does it if this service is unreachable at page load. The section never
shows a broken state.

## Endpoints

| | |
|---|---|
| `GET /health` | liveness, touches no calendar |
| `GET /slots` | `{ timezone, slotMinutes, generatedAt, slots: [{ start, end, date, time }] }` |
| `POST /book` | `{ name, email, start, company?, phone?, teamSize?, topic?, message?, website? }` |
| `POST /retention` | admin token; deletes bookings past the retention period |
| `POST /holds` | admin token; tops each working week up to `BOOKING_HOLDS_PER_WEEK` |

`start` must be the exact `start` of a slot from `/slots`. `website` is a honeypot: the form
hides it, so anything in it means a bot, and the service answers `200 {ok:true}` without
booking. Errors are `400 invalid_*`, `409 slot_taken`, `429 rate_limited`,
`502 upstream_error`.

Availability is re-checked inside `POST /book`, so a slot taken while someone was filling in
the form is refused with `409` rather than double-booked.

## Keeping the calendar from looking abandoned

A calendar where every slot for the next month is free tells a visitor that nobody books
demos here. `POST /holds` blocks one working hour in any week of the horizon that has
nothing in it at all, and `.github/workflows/holds.yml` calls it every few days.

```bash
curl -X POST "$ORIGIN/holds?dry_run=true" -H "Authorization: Bearer $BOOKING_ADMIN_TOKEN"
```

Two properties make it safe to run on a schedule. It is **idempotent**: a week is only ever
topped up to the target, so a second run the same day adds nothing, and a week that fills
with real bookings is left alone. And it is **deterministic**: the same week always proposes
the same slot, so a block does not wander between two visits to the page.

What it creates are the owner's own unavailable hours - title `Unavailable` by default, no
attendee, no personal data. They are not, and must not become, invented bookings: a prospect
who discovers the busy calendar was staged has been told something untrue about the business.
Set `BOOKING_HOLDS_PER_WEEK=0` to switch the whole thing off.

## Listing and cancelling

```bash
npm run cancel                          # next 60 days, with event ids
npm run cancel -- 689304406             # delete that event
npm run cancel -- --tests               # delete upcoming bookings by title prefix, after confirming
npm run cancel -- --older-than 6m       # retention sweep: delete past bookings older than 6 months
npm run cancel -- --older-than 6m --yes # same, unattended — for a scheduled job
```

The retention sweep is what makes a "we keep enquiries for six months" promise true: the personal
data lives in calendar events, not in a database, so nothing expires on its own. It only ever
touches events whose title starts with `BOOKING_TITLE_PREFIX`; everything else in the calendar is
left alone and reported as skipped. Periods are `30d`, `6m`, `1y` — months are counted on the
calendar and clamped, so six months before 31 August is 28 February rather than 3 March.

Deletion is immediate and there is no undo. `--tests` prints what it is about to remove and asks
first — worth remembering that real bookings carry the same title prefix as test ones, so it is
not a "test only" switch.

`DELETE /1/calendar/pim/event/{id}` is absent from Infomaniak's reference client and from the
endpoints they document; it was verified by hand against a live account (200, `data: null`, event
gone). It works, but treat it as unofficial and expect no notice if it changes.

Nothing in the booking flow deletes anything. This is a manual tool.

## Bot protection

Four layers, none of them a third-party service — a captcha would mean loading a script from
someone else's server on every page view, which is precisely what the privacy notice says the site
does not do.

| Layer | Stops |
|---|---|
| Signed proof-of-work challenge | POSTing at `/book` without ever loading the page — the first thing a scripted abuser writes |
| Minimum age of 3 s on the challenge | submissions faster than a person can fill in a form |
| Honeypot field | bots that fill in every input they find |
| Per-IP rate limit | volume, best-effort |

`GET /slots` hands out a challenge signed with `BOOKING_CHALLENGE_SECRET`. Before booking, the
browser must find a counter whose SHA-256 begins with `BOOKING_CHALLENGE_DIFFICULTY` zero bits —
measured at ~110k hashes/s through SubtleCrypto, difficulty 15 averages 0.3 s. The page solves it
in the background while the form is being filled in, so nobody waits. `POST /book` then checks the
signature, the age, the solution, and that this exact challenge has not already been spent.

Difficulty is a dial: every extra bit doubles the cost. 18 averages 2.4 s and occasionally takes
seven, which is too slow to hide from a visitor — hence 15.

Leave `BOOKING_CHALLENGE_SECRET` unset and the challenge disappears from `/slots` and stops being
required. The honeypot and the rate limit still apply. **The secret must be identical across edge
instances**, so it has to come from the environment.

What this does not stop is somebody driving a real browser. Nothing short of a captcha does, and a
captcha does not either — the point is to make the cheap attack uneconomical.

## Configuration

See `.env.example`. Booking rules — workdays, slot times, slot length, lead time, horizon —
are environment variables, so changing office hours does not require a code change.

Everything comes from the process environment — the code never touches the filesystem, because
on Bunny Edge Scripting there is none. Locally, Node loads `.env` itself through `--env-file`
(see the npm scripts); in production the values are the script's environment variables, with
`INFOMANIAK_TOKEN` set as an **environment secret** so it cannot be read back.

`PORT` is the switch between the two modes: set means "listen locally", unset means "the edge owns
the socket". Do not set it on Bunny.

## The timezone trap

Infomaniak's event API takes a wall-clock string *plus* a separate timezone name. Send a UTC
wall clock while declaring `Europe/Warsaw` and the event lands two hours off, silently.

Infomaniak's own reference client
([mcp-server-calendar](https://github.com/Infomaniak/mcp-server-calendar), `calendar-client.ts`)
has exactly this bug: it formats with `toISOString()` — UTC — and labels the result with the
profile's timezone. cal.com has the same class of bug against Infomaniak, open since January
2025 ([calcom/cal.com#18981](https://github.com/calcom/cal.com/issues/18981)).

`src/time.ts` exists to avoid it: everything is converted through `Intl` so the wall clock
sent always matches the timezone name declared, DST included. `npm test` covers both sides
of the October transition. If you change that file, run the tests.

## What is verified and what is not

Verified locally: slot generation, DST behaviour, busy-period subtraction, request
validation, CORS allowlist, the honeypot, rate limiting, and that the token does not appear
in logs or in any error returned to the browser.

Verified against a live Infomaniak account: listing calendars, listing events, detecting a busy
period and removing the slot it covers, creating an event at the correct local time, refusing a
second booking of the same slot (`409`), and deleting an event.

The event list comes back as a plain `data` array, with timestamps as ISO strings carrying an
offset (`2026-08-03T13:00:00+02:00`). `listBusy()` still accepts several other shapes and treats
anything unparseable as busy, so an unexpected change can only ever hide a free slot, never
double-book you.

**One thing the API decides for you:** the organiser on a created event is the owner of the
calendar the token belongs to. The `organizer: true` flag we send on an attendee is ignored —
confirmed by reading an event back after creating it. `BOOKING_ORGANIZER_EMAIL` therefore controls
who is *added* to the event, not the address the invitation appears to come from. If that address
matters, use a token belonging to the user who owns it.

## Deployment notes

- `npm run deploy` builds and pushes to Bunny. Step by step: [DEPLOY-BUNNY.pl.md](DEPLOY-BUNNY.pl.md).
- `.env` must never be committed. The token is equivalent to a password on your calendar.
- **The per-IP rate limit is best-effort at the edge.** It lives in the memory of one instance, and
  there are many short-lived instances, so a caller spread across regions sees a much higher
  effective limit than the configured one. It raises the cost of casual abuse and nothing more.
- TLS comes with the platform, including on a custom domain.
