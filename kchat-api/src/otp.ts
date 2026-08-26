// One-time e-mail codes, kept stateless the same way the proof-of-work challenge
// is: the 6-digit CODE is the secret and travels only by e-mail; the TOKEN is a
// signed commitment that is safe to hand back to the browser. Verifying needs only
// the secret, the submitted e-mail, the code and the token - no store.
//
//   token = base64url({ x: expiry }) . HMAC(secret, `${emailNorm}.${code}.${expiry}`)
//
// The browser proves it controls the e-mail by reading the code out of the inbox.
// The token being visible in the network tab reveals nothing: without the emailed
// code it cannot be used, and each token is single-use with a capped attempt count.

const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array): string =>
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const toBase64Url = (value: string): string =>
    btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromBase64Url = (value: string): string => {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    return atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
};

const hmacKey = async (secret: string): Promise<CryptoKey> =>
    crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
        "sign",
        "verify",
    ]);

export const hmacHex = async (secret: string, message: string): Promise<string> =>
    toHex(new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(message))));

const timingSafeEqual = (a: string, b: string): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
};

const normEmail = (email: string): string => email.trim().toLowerCase();

export interface IssuedCode {
    /** The 6-digit code - e-mailed to the user, never returned to the browser. */
    code: string;
    /** Opaque token the browser sends back with the code. */
    token: string;
    /** Absolute expiry, epoch ms. */
    expiresAt: number;
}

export const issueCode = async (secret: string, email: string, ttlMs: number): Promise<IssuedCode> => {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const expiry = Date.now() + ttlMs;
    const payload = toBase64Url(JSON.stringify({ x: expiry }));
    const sig = await hmacHex(secret, `${normEmail(email)}.${code}.${expiry}`);
    return { code, token: `${payload}.${sig}`, expiresAt: expiry };
};

export type VerifyResult = { ok: true } | { ok: false; reason: "malformed" | "expired" | "too_many" | "wrong_code" };

/** Tokens already accepted (single-use) and per-token wrong-code counts. Best-effort
 *  at the edge - the signature, the short expiry and the attempt cap bound the damage. */
const spent = new Map<string, number>();
const wrongCounts = new Map<string, number>();
const MAX_WRONG_PER_TOKEN = 5;

const forgetOld = (now: number) => {
    for (const [token, at] of spent) if (at < now - 60 * 60 * 1000) spent.delete(token);
};

export const verifyCode = async (
    secret: string,
    email: string,
    code: unknown,
    token: unknown,
    now: number = Date.now(),
): Promise<VerifyResult> => {
    const tokenStr = String(token ?? "");
    const codeStr = String(code ?? "");
    const [payload, sig] = tokenStr.split(".");
    if (!payload || !sig) return { ok: false, reason: "malformed" };

    let expiry: number;
    try {
        const parsed = JSON.parse(fromBase64Url(payload));
        if (typeof parsed?.x !== "number") return { ok: false, reason: "malformed" };
        expiry = parsed.x;
    } catch {
        return { ok: false, reason: "malformed" };
    }

    forgetOld(now);
    if (now > expiry) return { ok: false, reason: "expired" };
    if (spent.has(tokenStr)) return { ok: false, reason: "wrong_code" }; // already used - treat as invalid
    if ((wrongCounts.get(tokenStr) ?? 0) >= MAX_WRONG_PER_TOKEN) return { ok: false, reason: "too_many" };

    const expected = await hmacHex(secret, `${normEmail(email)}.${codeStr}.${expiry}`);
    if (!timingSafeEqual(sig, expected)) {
        wrongCounts.set(tokenStr, (wrongCounts.get(tokenStr) ?? 0) + 1);
        return { ok: false, reason: "wrong_code" };
    }

    spent.set(tokenStr, now); // single-use: one verified code posts one message
    wrongCounts.delete(tokenStr);
    return { ok: true };
};
