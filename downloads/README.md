# vallus downloads

Publishes the customer packages of a release to **Bunny Storage**, served from
`downloads.vallus.eu`. Nothing here is part of the website build.

Packages keep the names the pack scripts give them, here and on the server:

```
downloads.vallus.eu/
├── 1.4.2/
│   ├── vallus-ts-dist.zip                             TypeScript, any CPU
│   ├── vallus-rs-playwright-1.63.0-amd64-dist.zip     Rust with browsers, one per Playwright and CPU
│   ├── vallus-rs-playwright-1.63.0-arm64-dist.zip
│   ├── vallus-rs-slim-amd64-dist.zip                  Rust without browsers, one per CPU
│   ├── vallus-rs-slim-arm64-dist.zip
│   ├── SHA256SUMS                                     sha256sum -c format
│   └── release.json                                   every package: kind, CPU, Playwright, size, sha256
├── latest.json                      the current version; see below
└── index.html                       the page at downloads.vallus.eu/, every version
```

A browsers-only archive (`vallus-browsers-playwright-<from>-<to>-linux-<arch>.tar.gz`,
from `pack-browsers.sh`) is published the same way when there is one; none is today.

`latest.json` carries two lists: **`files`** - the short recommended set the licence
e-mail offers (the AMD64 runner with the newest Playwright, the AMD64 slim runner and
TypeScript, each description naming the CPU) - and **`all_files`**, everything in the
release. Both carry size, sha256 and URL, plus a link to SHA256SUMS.

## Releasing

1. Pack from committed trees, so each package carries the new version. One full Rust
   package per Playwright version and CPU, one slim package per CPU, one TypeScript
   package (`--platform` defaults to linux/amd64):
   ```
   cd playwrightRunner-rust
   bash scripts/pack-rs.sh --playwright 1.63.0                            # AMD64, with browsers
   bash scripts/pack-rs.sh --playwright 1.63.0 --platform linux/arm64
   bash scripts/pack-rs.sh --slim                                         # AMD64, no browsers
   bash scripts/pack-rs.sh --slim --platform linux/arm64
   cd ../playwrightRunner-ts && npm run pack
   ```
   Move them into one directory and point `PACKAGES_DIR` at it; publish.mjs takes
   every package it finds there and leaves anything else alone.
2. `cp .env.example .env` once, fill in the storage zone password.
3. Check the plan, then publish:
   ```
   node --env-file=.env publish.mjs --version 1.4.2 --dry-run
   node --env-file=.env publish.mjs --version 1.4.2
   ```

Node 20.6 or newer, `unzip` on the PATH. No npm install.

## What it guarantees

- **Every archive is checked against its own name.** Inside each zip it reads
  `VERSION` (or `package.json` for TypeScript), `PLATFORM` and, for a full Rust
  package, `PLAYWRIGHT`, and refuses the run when any of them disagrees with
  `--version` or with the CPU and Playwright version in the file name. That is what
  stops an arm64 image going out under an amd64 name, as 1.4.2 first did. Packages
  built before those files existed are refused too - repack them. The browsers-only
  archive carries no vallus and is taken by its name.
- **Bunny verifies every body.** Each upload sends the SHA-256 in the `Checksum`
  header, and Bunny rejects the object when it does not match. The directory is
  then listed back and compared.
- **A published version does not change.** A file already there with other bytes
  stops the run before anything is sent: customers check against the SHA256SUMS
  they already have, and air-gapped sites may hold the old archive. `--force`
  replaces it, for a correction nobody has downloaded yet.
- **An interrupted run resumes.** Files already there with the same checksum are
  skipped, so after a dropped connection on the 1 GB package just run it again.
- **The order is packages, SHA256SUMS, release.json, latest.json, index.html.**
  Nothing announces a release before its files are in place. `release.json` is
  written even into an already-published version: it describes the packages rather
  than changing them. With `BUNNY_API_KEY` set, latest.json and index.html are also
  purged from the CDN cache.

**index.html is rebuilt last**, from the storage listing, so the page at
`downloads.vallus.eu/` lists every version on the server - also ones published with
`--no-latest` or from another machine - from `MIN_LISTED_VERSION` (1.4.2) up. Older
versions stay on the server for existing links but are not offered. Bunny Storage
serves `index.html` for `/` and lists nothing on its own.

The page groups the packages under **Node** and **Rust** (and **Browsers** when one is
published) and carries an **AMD64 / ARM64 switch, AMD64 selected by default**, so a
visitor sees only what runs on their machine; the choice is kept in the address
(`#arm64`) and works without JavaScript.

Options:

| Option | What it does |
|---|---|
| `--version X.Y.Z` | the release to publish; required unless `--index-only` |
| `--dry-run` | hashes, checks every archive and prints the plan without sending |
| `--no-latest` | publishes without making it the current version (a hotfix for an older line) |
| `--force` | replaces a published file, for a correction nobody has downloaded yet |
| `--index-only` | rebuilds index.html alone (with `--dry-run`, prints what it would list) |

## Bunny setup (once)

1. **Storage zone** `vallus-downloads`, main region in the EU (Falkenstein).
   Replication is optional; customers download through the CDN either way.
2. **Pull zone** with the storage zone as its origin, hostname
   `downloads.vallus.eu` (CNAME in DNS, then the free certificate).
3. In the pull zone, cache the versioned paths for a long time - they never
   change - and keep `latest.json` short, or rely on the purge above.

The archives are public on purpose: vallus does not start without a licence
key, so the key is the gate, not the download. A customer can fetch a package on
a connected machine and carry it into a closed network without asking for a
link.

## Tests

```
node --test publish.test.mjs
```

Runs against a local stand-in for the Storage API that checks the AccessKey and
enforces the Checksum header, with real zip archives.
