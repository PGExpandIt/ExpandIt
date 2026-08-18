// HMAC-SHA256 over the raw request body, so the mailer only acts on requests the
// edge actually signed with the shared secret. Web Crypto (crypto.subtle) is a
// global on Node 20, so the same code would run anywhere.

const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array): string =>
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const key = async (secret: string): Promise<CryptoKey> =>
    crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
        "sign",
        "verify",
    ]);

export const sign = async (secret: string, message: string): Promise<string> =>
    toHex(new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(message))));

/** Constant-time compare so a wrong signature cannot be found one character at a time. */
const timingSafeEqual = (a: string, b: string): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
};

export const verify = async (secret: string, message: string, signatureHex: string): Promise<boolean> => {
    if (!signatureHex) return false;
    const expected = await sign(secret, message);
    return timingSafeEqual(expected, signatureHex);
};
