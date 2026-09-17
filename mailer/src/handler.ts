// The mailer API as one Web-standard handler: Request in, Response out. Only the
// edge calls it, authenticated by an HMAC signature over the raw body - there is no
// CORS or browser here, so a bad signature is the only gate that matters.

import type { Config } from "./config.js";
import { verify } from "./hmac.js";
import { LicenseLedger } from "./ledger.js";
import { buildFreePayload, issueFreeLicense, signLicense } from "./license.js";
import type { CodeSender } from "./mailer.js";

const MAX_BODY_BYTES = 4 * 1024;
const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;
const CODE = /^\d{4,8}$/;
/** Same cap as the /free form's relay. Control characters would end up inside a signed
 *  company name nobody can type back into the setup wizard. */
const MAX_COMPANY_CHARS = 120;
const CONTROL = /[\u0000-\u001f\u007f]/;

const json = (status: number, payload: unknown): Response =>
    new Response(JSON.stringify(payload), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });

/** Per-recipient send attempts, so a leaked signing secret still cannot bomb one inbox. */
const attempts = new Map<string, number[]>();

const rateLimited = (email: string, perHour: number): boolean => {
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const recent = (attempts.get(email) ?? []).filter((at) => at > hourAgo);
    attempts.set(email, recent);
    if (recent.length >= perHour) return true;
    recent.push(Date.now());
    return false;
};

/** Reads and authenticates a signed POST body; a Response means it was refused. */
const readSigned = async (config: Config, request: Request): Promise<{ body: any } | Response> => {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, { error: "too_large" });

    // Authenticate: the signature must cover the exact bytes we received.
    const signature = request.headers.get("x-signature") ?? "";
    if (!(await verify(config.authSecret, raw, signature))) {
        return json(401, { error: "bad_signature" });
    }

    try {
        return { body: JSON.parse(raw || "{}") };
    } catch {
        return json(400, { error: "bad_request" });
    }
};

export const createHandler = (
    config: Config,
    sender: CodeSender,
    now: () => Date = () => new Date(),
    // In memory unless the server passes the one on disk.
    ledger: LicenseLedger = new LicenseLedger(null),
) => {
    return async (request: Request): Promise<Response> => {
        const url = new URL(request.url);

        if (request.method === "GET" && url.pathname === "/health") {
            return json(200, { ok: true });
        }

        if (request.method === "POST" && url.pathname === "/send-license") {
            return sendLicense(config, sender, ledger, request, now());
        }

        if (request.method !== "POST" || url.pathname !== "/send-code") {
            return json(404, { error: "not_found" });
        }

        const signed = await readSigned(config, request);
        if (signed instanceof Response) return signed;
        const { body } = signed;

        const email = String(body?.email ?? "").trim();
        const code = String(body?.code ?? "").trim();
        if (!EMAIL.test(email) || email.length > 200) return json(400, { error: "invalid_email" });
        if (!CODE.test(code)) return json(400, { error: "invalid_code" });

        if (rateLimited(email.toLowerCase(), config.rateLimitPerHour)) {
            return json(429, { error: "rate_limited" });
        }

        try {
            await sender.sendCode(email, code);
        } catch (error) {
            // The SMTP error can carry the mailbox address or server detail - log it,
            // return something generic.
            console.error(`[mailer] send to ${email} failed:`, error);
            return json(502, { error: "send_failed" });
        }

        return json(200, { ok: true });
    };
};

/**
 * Signs a free-tier key for `company` and mails it to `email`. The edge calls this only
 * after the visitor proved control of the address with a one-time code, so the e-mail
 * is verified by the time it arrives here; the signature on the request is what proves
 * the edge sent it.
 *
 * The key is not returned: the edge needs only the expiry for its notification, and a
 * key that never leaves this process cannot end up in an edge log.
 */
const sendLicense = async (
    config: Config,
    sender: CodeSender,
    ledger: LicenseLedger,
    request: Request,
    now: Date,
): Promise<Response> => {
    // Off unless the free key is configured, so a mailer deployed ahead of the runner
    // release that carries the free public key cannot issue keys nobody can use.
    if (!config.freeLicense) return json(404, { error: "not_found" });

    const signed = await readSigned(config, request);
    if (signed instanceof Response) return signed;
    const { body } = signed;

    const email = String(body?.email ?? "").trim();
    // Not trimmed: the key is bound to the name byte for byte, and the edge has already
    // trimmed what the visitor typed. Trimming again here could only make the two differ.
    const company = String(body?.company ?? "");
    if (!EMAIL.test(email) || email.length > 200) return json(400, { error: "invalid_email" });
    if (!company.trim() || company.length > MAX_COMPANY_CHARS || CONTROL.test(company)) {
        return json(400, { error: "invalid_company" });
    }

    // Shares the per-recipient budget with codes: a licence always follows a code, so
    // one real request costs two sends, and a leaked secret still cannot bomb an inbox.
    if (rateLimited(email.toLowerCase(), config.rateLimitPerHour)) {
        return json(429, { error: "rate_limited" });
    }

    const settings = config.freeLicense;
    return ledger.exclusive(async () => {
        const decision = ledger.decide(email, company, now);

        // Not issued automatically; the edge relays the request to the channel instead.
        if (decision.action === "manual") return json(409, { error: "manual_review", reason: decision.reason });

        if (decision.action === "resend") {
            // The key it already has, rebuilt rather than stored: RSA PKCS#1 v1.5 is
            // deterministic, so the same company and expiry sign to the same key.
            const { company: signedCompany, expires } = decision.entry;
            const key = signLicense({ ...buildFreePayload(signedCompany, now, 1), expires }, settings.privateKeyPem);
            try {
                await sender.sendLicense(email, { company: signedCompany, key, expires });
            } catch (error) {
                console.error(`[mailer] licence re-send to ${email} failed:`, error);
                return json(502, { error: "send_failed" });
            }
            return json(200, { ok: true, expires, reissued: true });
        }

        const license = issueFreeLicense(company, settings.privateKeyPem, settings.termDays, now);
        try {
            await sender.sendLicense(email, { company, key: license.key, expires: license.payload.expires });
        } catch (error) {
            // Not recorded: nothing reached the visitor, so asking again must issue.
            console.error(`[mailer] licence to ${email} failed:`, error);
            return json(502, { error: "send_failed" });
        }
        ledger.record(email, company, license.payload.expires, now);
        return json(200, { ok: true, expires: license.payload.expires, reissued: false });
    });
};
