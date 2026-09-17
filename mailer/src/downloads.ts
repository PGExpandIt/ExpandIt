// Where a free licence e-mail sends people to get vallus.
//
// The packages live on downloads.vallus.eu under a directory per version, and
// latest.json there names the current one (written last by downloads/publish.mjs).
// Reading it at send time keeps the links pointing at the newest release without
// touching the mailer on every release - a hard-coded version would go stale on the
// first one after this deploy.
//
// A licence is worth sending without links, and the links are worth nothing without
// the licence, so nothing here may fail a send: an unreachable or malformed
// latest.json yields a link to the downloads page, which lists every release.

export interface DownloadFile {
    name: string;
    description: string;
    size: number;
    url: string;
}

export interface Release {
    version: string;
    files: DownloadFile[];
    sha256sums: string | null;
}

/** How long a fetched release is reused. Releases are rare; a burst of sign-ups is not. */
const CACHE_MS = 5 * 60_000;
/** A slow downloads host must not hold the licence e-mail for long. */
const FETCH_TIMEOUT_MS = 3_000;

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/**
 * Parses latest.json, keeping only links under `baseUrl`. The file is ours, but the
 * e-mail goes to a stranger's inbox with our name on it, so a link to anywhere else
 * - a mistake or a tampered file - is dropped rather than mailed.
 */
export const parseRelease = (raw: unknown, baseUrl: string): Release | null => {
    if (!raw || typeof raw !== "object") return null;
    const data = raw as Record<string, unknown>;
    const prefix = `${baseUrl.replace(/\/+$/, "")}/`;
    const ours = (url: unknown): url is string => typeof url === "string" && url.startsWith(prefix);
    if (typeof data.version !== "string" || !/^\d+\.\d+\.\d+$/.test(data.version)) return null;
    const files = (Array.isArray(data.files) ? data.files : [])
        .filter((file): file is Record<string, unknown> => !!file && typeof file === "object")
        .filter((file) => ours(file.url) && typeof file.name === "string")
        .map((file) => ({
            name: file.name as string,
            description: typeof file.description === "string" ? file.description : (file.name as string),
            size: typeof file.size === "number" && file.size > 0 ? file.size : 0,
            url: file.url as string,
        }));
    if (files.length === 0) return null;
    return { version: data.version, files, sha256sums: ours(data.sha256sums) ? data.sha256sums : null };
};

const megabytes = (bytes: number): string => `${Math.round(bytes / (1024 * 1024))} MB`;

/** The download section of the e-mail, as plain text. */
export const formatDownloads = (release: Release | null, baseUrl: string): string => {
    const base = baseUrl.replace(/\/+$/, "");
    if (!release) {
        return `Download vallus: ${base}/ lists every release with its packages and checksums.`;
    }
    const lines = [`Download vallus ${release.version}:`];
    for (const file of release.files) {
        lines.push(`- ${file.description}${file.size ? ` (${megabytes(file.size)})` : ""}: ${file.url}`);
    }
    if (release.sha256sums) lines.push(`SHA-256 checksums: ${release.sha256sums}`);
    return lines.join("\n");
};

/** latest.json, fetched on demand and reused for a few minutes. */
export class DownloadsDirectory {
    private cached: { at: number; release: Release } | null = null;

    constructor(
        private readonly baseUrl: string,
        private readonly fetchImpl: FetchLike = fetch,
        private readonly now: () => number = Date.now,
    ) {}

    /** The download section for the e-mail. Never throws. */
    async section(): Promise<string> {
        return formatDownloads(await this.release(), this.baseUrl);
    }

    private async release(): Promise<Release | null> {
        if (this.cached && this.now() - this.cached.at < CACHE_MS) return this.cached.release;
        try {
            const response = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, "")}/latest.json`, {
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!response.ok) throw new Error("latest.json not available");
            const release = parseRelease(await response.json(), this.baseUrl);
            if (!release) throw new Error("latest.json is not a release");
            this.cached = { at: this.now(), release };
            return release;
        } catch (err) {
            // A failure is not cached: the next licence tries again. The last good
            // release is still better than the link to the page.
            console.error(`[mailer] downloads: ${String(err)}`);
            return this.cached?.release ?? null;
        }
    }
}
