# vallus downloads

Publishes the customer packages of a release to **Bunny Storage**, served from
`downloads.vallus.eu`. Nothing here is part of the website build.

```
downloads.vallus.eu/
├── 1.4.1/
│   ├── vallus-rs-1.4.1.zip          Rust, browsers included
│   ├── vallus-rs-slim-1.4.1.zip     Rust, without browsers
│   ├── vallus-ts-1.4.1.zip          TypeScript
│   └── SHA256SUMS                   sha256sum -c format
└── latest.json                      the current version, sizes, hashes, URLs
```

## Releasing

1. Pack all three from committed trees, so each package carries the new version:
   ```
   cd playwrightRunner-rust && bash scripts/pack-rs.sh && bash scripts/pack-rs.sh --slim
   cd playwrightRunner-ts && npm run pack
   ```
2. `cp .env.example .env` once, fill in the storage zone password.
3. Check the plan, then publish:
   ```
   node --env-file=.env publish.mjs --version 1.4.1 --dry-run
   node --env-file=.env publish.mjs --version 1.4.1
   ```

Node 20.6 or newer, `unzip` on the PATH. No npm install.

## What it guarantees

- **The version is checked, not assumed.** The archive names carry no version, so
  it reads `VERSION` (Rust packages, written by `pack-rs.sh`) or `package.json`
  (TS) inside each zip and refuses anything that is not `--version`. Packages
  built before `VERSION` existed are refused too - repack them.
- **Bunny verifies every body.** Each upload sends the SHA-256 in the `Checksum`
  header, and Bunny rejects the object when it does not match. The directory is
  then listed back and compared.
- **A published version does not change.** A file already there with other bytes
  stops the run before anything is sent: customers check against the SHA256SUMS
  they already have, and air-gapped sites may hold the old archive. `--force`
  replaces it, for a correction nobody has downloaded yet.
- **An interrupted run resumes.** Files already there with the same checksum are
  skipped, so after a dropped connection on the 1 GB package just run it again.
- **latest.json goes last**, after every package and SHA256SUMS is in place, so it
  never announces a release that is half uploaded. With `BUNNY_API_KEY` set it is
  also purged from the CDN cache.

Options: `--dry-run` hashes, checks versions and lists the plan without sending;
`--no-latest` publishes a version without making it the current one (a hotfix
for an older line, say).

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
