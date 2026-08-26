// Shared client helpers for the kChat relay used by the contact and licence forms.
// The relay advertises whether OTP e-mail verification is on (GET /config → otp),
// so the forms pick a one-step or two-step flow at runtime - no rebuild needed to
// switch once the mailer is wired up on the edge.

export interface Challenge {
    token: string;
    salt: string;
    difficulty: number;
}

export interface KchatConfig {
    challenge: Challenge | null;
    otp: boolean;
}

/**
 * Proof of work: find a counter whose SHA-256 starts with enough zero bits. Solved
 * in the background so the answer is ready before the visitor submits - a fraction
 * of a second, no third-party script, no cookie, no captcha.
 */
export async function solveChallenge(challenge: Challenge): Promise<number> {
    const encoder = new TextEncoder();
    for (let counter = 0; counter < 50_000_000; counter += 1) {
        const digest = new Uint8Array(
            await crypto.subtle.digest("SHA-256", encoder.encode(`${challenge.salt}:${counter}`)),
        );
        let bits = 0;
        for (const byte of digest) {
            if (byte === 0) {
                bits += 8;
                continue;
            }
            bits += Math.clz32(byte) - 24;
            break;
        }
        if (bits >= challenge.difficulty) return counter;
    }
    throw new Error("challenge unsolved");
}

export async function fetchKchatConfig(api: string): Promise<KchatConfig> {
    const res = await fetch(`${api}/config`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`config ${res.status}`);
    const body = await res.json();
    return { challenge: body?.challenge ?? null, otp: body?.otp === true };
}

/** Turns a failed response into a readable message, preferring the server's own. */
export async function errorFrom(res: Response, fallback: string): Promise<string> {
    const body = await res.json().catch(() => null);
    if (body?.error === "challenge_failed" || body?.error === "code_invalid") {
        return body.reason === "expired"
            ? "That took too long - please request a new code."
            : "Verification failed. Please try again.";
    }
    return (body?.message as string) ?? fallback;
}

/**
 * Asks the relay to e-mail a code. Carries the proof-of-work solution, which the
 * relay requires on this (e-mail-sending) step. Returns the signed token the form
 * submits alongside the code the user types in.
 */
export async function requestCode(
    api: string,
    params: { email: string; challenge: Challenge | null; solution: number | null; website?: string },
): Promise<{ token: string; expiresAt: number }> {
    const res = await fetch(`${api}/request-code`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            email: params.email,
            challenge: params.challenge?.token,
            solution: params.solution,
            website: params.website ?? "",
        }),
    });
    if (!res.ok) throw new Error(await errorFrom(res, `Could not send the code (${res.status}).`));
    return res.json();
}
