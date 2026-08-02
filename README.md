# vallus website

Marketing site for **vallus**, the Playwright test runner with a web dashboard, published by
ExpandIt. Next.js with a static export, deployed to bunny.net by
`.github/workflows/bunny.yml` on every push to `main`.

Two pieces, deployed to two different places:

| | | |
|---|---|---|
| `src/` | the site — static, no server needed | bunny.net, by GitHub Actions |
| `booking-api/` | books real slots in the Infomaniak calendar ([its README](booking-api/README.md)) | Bunny Edge Scripting, by `npm run deploy` |

The site works without the booking API. Without it — or when it cannot be reached — the demo
section shows an example calendar and hands the request to the visitor's mail client. Nothing
breaks.

## Running it

**Everything at once** — site plus booking API, wired together:

```bash
npm install
npm run dev:all          # site → http://localhost:3100, API → http://localhost:8787
```

This pins both ports and sets the API's `ALLOWED_ORIGINS` to the site's origin. Doing it by hand
means keeping those in sync yourself, and Next silently moves to another port when 3000 is taken,
which then breaks CORS in a way that looks like the API being down.

It needs `booking-api/.env` (see [DEPLOY-BUNNY.pl.md](booking-api/DEPLOY-BUNNY.pl.md)). Without
that file it starts the site alone and says so.

**Just the site**, no calendar:

```bash
npm run dev              # http://localhost:3000, or the next free port
```

**The static export, exactly as bunny.net will serve it:**

```bash
npm run build
npm start                # http://localhost:4000
```

Worth doing before a release — it is the only way to catch things that work in dev and break in
the export. `npm start` serves `out/` under whatever `basePath` the build used, which is why it
exists instead of a plain static file server.

> Do not run `npm run build` while `npm run dev` is up. The build wipes `.next/` and the dev
> server starts answering `Internal Server Error` until restarted.

## Checks

```bash
npm run lint
cd booking-api && npm test      # slot rules, DST, busy-period handling
```

---

# Configuration reference

Three places hold configuration, and it matters which is which. **The Infomaniak token never goes
into GitHub** — the booking API is not deployed by GitHub Actions, so GitHub has no reason to hold
a credential for your calendar.

| Where | Holds | Who reads it |
|---|---|---|
| GitHub → Actions secrets & variables | bunny.net credentials, the public API origin | the deploy workflow |
| `booking-api/.env` locally, Bunny script env in production | Infomaniak token, booking rules | the booking service |
| Files in this repo | prices, palette, basePath | the build |

## 1. GitHub Actions — for deploying the site

**Settings → Secrets and variables → Actions.** Secrets are write-only and masked in logs;
variables are visible to anyone who can read the repo, so nothing sensitive goes in one.

### Secrets

| Name | Required | What it is |
|---|---|---|
| `BUNNY_STORAGE_ZONE_PASSWORD` | yes | Storage zone password with **read+write**. bunny.net → Storage → your zone → *FTP & API Access* → Password. A read-only key uploads nothing and fails late |
| `BUNNY_ACCESS_KEY` | only to purge | Account API key. bunny.net → Account Settings → API. Used solely to purge the pull zone after upload |

### Variables

| Name | Required | Example | What it is |
|---|---|---|---|
| `BUNNY_STORAGE_ZONE_NAME` | yes | `vallus-site` | the storage zone the build is uploaded into |
| `BUNNY_STORAGE_ENDPOINT` | yes | `https://storage.bunnycdn.com` | endpoint of the zone's **primary** region. Falkenstein is the bare host; others are prefixed (`ny.`, `sg.`, `la.`, …). A wrong region fails authentication rather than misplacing files |
| `BUNNY_PULL_ZONE_ID` | only to purge | `1234567` | numeric id, from the pull zone's URL in the dashboard |
| `BOOKING_API_ORIGIN` | no | `https://api.vallus.eu` | baked into the JavaScript bundle as `NEXT_PUBLIC_BOOKING_API`. Public by design. Leave unset until the booking API is live — the demo section then uses its offline fallback |

## 2. Booking API — locally `.env`, in production the Bunny script environment

Locally a `.env` file, **never committed**, loaded by Node through `--env-file`. In production the
Bunny script's environment variables — with `INFOMANIAK_TOKEN` set as an **environment secret**, so
it cannot be read back. The code never touches the filesystem; on the edge there is none.
Full walkthrough: [DEPLOY-BUNNY.pl.md](booking-api/DEPLOY-BUNNY.pl.md).

### Required

| Name | Example | What it is |
|---|---|---|
| `INFOMANIAK_TOKEN` | — | API token from [manager.infomaniak.com](https://manager.infomaniak.com/v3/ng/accounts/token/list). Scope `workspace:calendar`; `user_info` is only needed when `BOOKING_ORGANIZER_EMAIL` is unset. Shown once at creation. Treat as a password on your calendar |

### Strongly recommended

| Name | Default | What it is |
|---|---|---|
| `INFOMANIAK_CALENDAR_ID` | first calendar on the account | Pin it, so a new calendar appearing on the account cannot silently become the target. `npm run probe` lists the ids. Not the `account_id` — that mismatch returns a confusing `403` |
| `ALLOWED_ORIGINS` | `https://vallus.eu` | Comma-separated **exact** origins allowed to call the API. No wildcards. Add every origin the site answers on, e.g. `https://vallus.eu,https://www.vallus.eu` |
| `BOOKING_TIMEZONE` | `Europe/Warsaw` | IANA name. The offered slots are your working hours, not the visitor's. Must match how the calendar is set up, or every slot is offered at the wrong hour |
| `BOOKING_ORGANIZER_EMAIL` | the token's profile address | Who is added to the event as organiser. **Does not change who the invitation appears to come from** — Infomaniak always uses the calendar owner for that, confirmed by reading an event back after creating it |
| `BOOKING_ORGANIZER_NAME` | the email address | Display name next to it |

### Booking rules — change these, restart, done. No code change, no site rebuild

| Name | Default | What it is |
|---|---|---|
| `BOOKING_WORKDAYS` | `1,2,3,4,5` | ISO weekdays that may be booked. 1 = Monday … 7 = Sunday |
| `BOOKING_SLOT_TIMES` | `09:00,11:00,13:00,15:00` | Local start times offered, in `BOOKING_TIMEZONE` |
| `BOOKING_SLOT_MINUTES` | `30` | Length of one slot |
| `BOOKING_LEAD_HOURS` | `24` | How far ahead the earliest bookable slot must be |
| `BOOKING_HORIZON_DAYS` | `30` | How far into the future slots are offered |
| `BOOKING_TITLE_PREFIX` | `vallus demo` | Event title prefix. Also what `npm run cancel -- --tests` matches, so real bookings share it |
| `BOOKING_RATE_LIMIT_PER_HOUR` | `5` | Booking attempts per IP per hour, held in memory |
| `BOOKING_CHALLENGE_SECRET` | — | Signs the proof-of-work challenge that stops bots POSTing straight at `/book`. Unset disables it. Must be identical on every edge instance |
| `BOOKING_CHALLENGE_DIFFICULTY` | `15` | Leading zero bits. 15 ≈ 0.3 s in a browser, solved in the background; each extra bit doubles it |
| `BOOKING_ADMIN_TOKEN` | — | Guards `POST /retention`. Unset makes the endpoint return 404 |
| `BOOKING_RETENTION_PERIOD` | `6m` | Default period for the scheduled cleanup |
| `PORT` | — | Set locally to listen on a port. **Unset on Bunny** — that is how the entry point tells edge mode from local |

Days off are not a separate setting: block the time in the Infomaniak calendar and those slots
stop being offered, like any other busy period.

`INFOMANIAK_API_BASE` also exists, defaulting to `https://api.infomaniak.com`. It is there to point
the service at a stub during testing and has no use in production.

## 3. In the repository

| Where | What |
|---|---|
| `prices.json` | every price, tier, add-on, discount and the trial length. Edit and redeploy — no code change |
| `next.config.ts` | `basePath` — must be **empty** for the root-domain bunny.net deployment. The workflow fails the build if the export is not rooted at `/`, because the failure mode is a site with no styling at all |
| `src/app/globals.css` | the palette. Two blocks, one active — swap the comments to switch |

## Deployment notes

`.github/workflows/bunny.yml` lints, builds, verifies the export is rooted correctly, uploads
`out/` to the storage zone and purges the pull zone.

`enable-delete-action` is on, so files removed from the build are removed from the zone. Without
it a renamed page would stay reachable at its old URL forever.

In the bunny.net dashboard, point the pull zone's **custom error page** at `/404.html`, otherwise
an unknown URL gets Bunny's own error page instead of the site's.

### Why the booking API is not in this workflow

Deliberate, not an omission. Two reasons:

- **Infomaniak has no API for it.** Their public OpenAPI spec (938 endpoints) contains no web
  hosting or Node.js site endpoints, and the only `restart` endpoints belong to radio and video
  streaming. Restarting the app is a dashboard action, so CI could upload code but not put it
  live — the half-automated result is worse than doing it deliberately.
- **The blast radius differs.** A bad site deploy is cosmetic. A bad API deploy stops bookings,
  and the site hides it by falling back to the example calendar and a mailto request — so nobody
  notices until a prospect complains. A typo in page copy should not be able to do that.

Updating the service: see [DEPLOY-BUNNY.pl.md](booking-api/DEPLOY-BUNNY.pl.md).
