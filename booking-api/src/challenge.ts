// Proof-of-work challenge for the booking form.
//
// Why this rather than a captcha: a captcha means a third-party script, a
// third-party request on every page load, and - for the usual providers - sending
// visitor data to a US company. The privacy notice says the site makes no
// third-party requests, and the whole product story is about data staying in
// Europe. So the check is done here, with nothing loaded from outside.
//
// How it works. `/slots` hands out a signed challenge. Before booking, the browser
// must find a number whose hash starts with enough zero bits - a fraction of a
// second of work for one person, and a real cost for anyone hammering the endpoint.
// `/book` then verifies the signature, the age and the solution.
//
// What it actually stops:
//   • blind POSTs straight at /book, which is what a scripted abuser writes first
//   • high-volume submissions, because each one costs measurable CPU
//   • instant submissions, because a challenge younger than a few seconds is refused
//
// What it does not stop: a determined attacker running a real browser. Nothing
// short of a captcha does, and a captcha does not either. The point is to make the
// cheap attack uneconomical, not to be impassable.

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

// Uint8Array<ArrayBuffer> rather than the default Uint8Array: TypeScript widens the
// backing buffer to ArrayBufferLike, which crypto.subtle refuses because it could be
// a SharedArrayBuffer.
const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
};

const hmacKey = async (secret: string): Promise<CryptoKey> =>
    crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    );

/** Number of leading zero bits in a digest. */
const leadingZeroBits = (digest: Uint8Array): number => {
    let bits = 0;
    for (const byte of digest) {
        if (byte === 0) {
            bits += 8;
            continue;
        }
        // Math.clz32 counts on 32 bits; shift the byte up to the top of one.
        bits += Math.clz32(byte) - 24;
        break;
    }
    return bits;
};

export interface IssuedChallenge {
    /** Opaque token the browser sends back untouched. */
    token: string;
    /** The string to hash, with the counter appended after a colon. */
    salt: string;
    /** How many leading zero bits the digest must have. */
    difficulty: number;
}

interface Payload {
    n: string;
    t: number;
    d: number;
}

const decodePayload = (token: string): { payload: Payload; body: string; signature: string } | null => {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    try {
        const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
        if (typeof payload?.n !== "string" || typeof payload?.t !== "number" || typeof payload?.d !== "number") {
            return null;
        }
        return { payload, body, signature };
    } catch {
        return null;
    }
};

export const issueChallenge = async (secret: string, difficulty: number): Promise<IssuedChallenge> => {
    const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(12)));
    const payload: Payload = { n: nonce, t: Date.now(), d: difficulty };
    const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
    const signature = toBase64Url(
        new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body))),
    );
    return { token: `${body}.${signature}`, salt: nonce, difficulty };
};

export type VerifyResult =
    | { ok: true }
    | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "too_fast" | "wrong_solution" | "replayed" };

/**
 * Solutions already accepted, so one challenge cannot be reused for a flood of
 * bookings. In-memory and therefore best-effort at the edge - the signature and the
 * short expiry are what bound the damage; this only closes the easy loop.
 */
const spent = new Map<string, number>();

const forgetOldSpent = (maxAgeMs: number) => {
    const cutoff = Date.now() - maxAgeMs;
    for (const [token, at] of spent) if (at < cutoff) spent.delete(token);
};

export const verifyChallenge = async (
    secret: string,
    token: string,
    solution: unknown,
    options: { minAgeMs: number; maxAgeMs: number },
): Promise<VerifyResult> => {
    const decoded = decodePayload(token);
    if (!decoded) return { ok: false, reason: "malformed" };

    const valid = await crypto.subtle.verify(
        "HMAC",
        await hmacKey(secret),
        fromBase64Url(decoded.signature),
        encoder.encode(decoded.body),
    );
    if (!valid) return { ok: false, reason: "bad_signature" };

    const age = Date.now() - decoded.payload.t;
    if (age > options.maxAgeMs || age < -60_000) return { ok: false, reason: "expired" };
    // A challenge solved and submitted within a couple of seconds was not filled in
    // by a person reading a form.
    if (age < options.minAgeMs) return { ok: false, reason: "too_fast" };

    forgetOldSpent(options.maxAgeMs);
    if (spent.has(token)) return { ok: false, reason: "replayed" };

    const counter = Number(solution);
    if (!Number.isInteger(counter) || counter < 0) return { ok: false, reason: "wrong_solution" };

    const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", encoder.encode(`${decoded.payload.n}:${counter}`)),
    );
    if (leadingZeroBits(digest) < decoded.payload.d) return { ok: false, reason: "wrong_solution" };

    spent.set(token, Date.now());
    return { ok: true };
};
