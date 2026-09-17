// One free licence per organisation at a time.
//
// Every key the mailer issues is recorded here, and /send-license consults the record
// before it signs anything. The rules, in the order they are applied:
//
// - A personal or disposable mailbox (gmail.com, outlook.com, mailinator.com...) says
//   nothing about the organisation, so no key is issued automatically: the request
//   goes to the channel and is answered by hand.
// - The same e-mail domain, or the same address, with a licence that is still valid
//   gets that licence again - the same key, not a second one. Someone who lost the
//   e-mail is served, and asking again gains nothing.
// - The same company name from ANOTHER domain is not sent the existing key (it
//   belongs to someone else's address) and is not issued a new one either: it goes to
//   the channel, flagged.
// - From 14 days before a licence ends, the organisation may have a new one: the
//   term is renewable, it just may not overlap.
//
// A key cannot be revoked - the runners verify it offline - so this is what keeps the
// free tier at one six-month key per organisation. It is not proof against someone
// registering a new domain; it is meant to make that more work than buying.
//
// Storage is a JSON-lines file: one mailer instance, a handful of licences a day, and
// a file an operator can read, grep and back up. Appends are serialised in process.

import fs from "node:fs";
import path from "node:path";

/** Days before expiry from which a new licence may be issued. */
export const RENEWAL_WINDOW_DAYS = 14;

export interface LedgerEntry {
    /** ISO timestamp. */
    issuedAt: string;
    /** Exactly as signed - the key is bound to it byte for byte. */
    company: string;
    /** normaliseCompany(company), what names are compared by. */
    companyKey: string;
    email: string;
    domain: string;
    /** YYYY-MM-DD, as in the key. */
    expires: string;
}

export type LicenseDecision =
    | { action: "issue" }
    /** Same organisation, still valid: mail the key it already has. */
    | { action: "resend"; entry: LedgerEntry }
    | { action: "manual"; reason: "personal_email" | "company_has_licence" };

/**
 * Mailboxes anyone can open for free, and throwaway ones. A domain here identifies a
 * provider, not an organisation. Kept short on purpose - the common ones, where a
 * miss matters - rather than a list that is never complete anyway.
 */
const PERSONAL_DOMAINS = new Set([
    // global
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
    "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com", "gmx.com",
    "gmx.net", "mail.com", "proton.me", "protonmail.com", "pm.me", "tutanota.com",
    "tuta.io", "zoho.com", "yandex.com", "yandex.ru", "mail.ru", "fastmail.com", "hey.com",
    "hotmail.co.uk", "yahoo.co.uk", "outlook.de", "gmx.de", "web.de", "t-online.de",
    "hotmail.fr", "orange.fr", "free.fr", "libero.it", "seznam.cz", "qq.com", "163.com",
    // Poland
    "wp.pl", "o2.pl", "onet.pl", "op.pl", "interia.pl", "interia.eu", "poczta.onet.pl",
    "tlen.pl", "gazeta.pl", "vp.pl", "go2.pl", "autograf.pl", "buziaczek.pl",
    // disposable
    "mailinator.com", "guerrillamail.com", "sharklasers.com", "10minutemail.com",
    "temp-mail.org", "tempmail.com", "yopmail.com", "trashmail.com", "getnada.com",
    "maildrop.cc", "dispostable.com", "throwawaymail.com", "mintemail.com", "emailondeck.com",
]);

/** Legal-form words that do not tell two organisations apart. Compared as whole words. */
const LEGAL_FORMS = new Set([
    "sp", "z", "o", "oo", "spolka", "zoo", "sa", "sk", "ska", "spk", "sc", "spj",
    "gmbh", "ag", "kg", "ug", "ohg", "mbh", "co", "kgaa",
    "ltd", "limited", "llc", "llp", "inc", "incorporated", "corp", "corporation", "plc", "company",
    "bv", "nv", "sarl", "sas", "srl", "spa", "oy", "ab", "as", "aps", "pty", "sro", "doo", "kft",
    "group", "the",
]);

/** The domain of an address, lowercased. */
export const emailDomain = (email: string): string => email.slice(email.lastIndexOf("@") + 1).trim().toLowerCase();

export const isPersonalDomain = (domain: string): boolean => PERSONAL_DOMAINS.has(domain.toLowerCase());

/**
 * A company name reduced to what identifies it: no case, accents, punctuation or legal
 * form. "ACME Sp. z o.o.", "Acme sp. z o. o." and "acme" are one company. Falls back to
 * the plain lowercased name when nothing but legal-form words is left.
 */
export const normaliseCompany = (company: string): string => {
    const tokens = company
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[łŁ]/g, "l")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(" ")
        .filter(Boolean);
    // Initials written with dots fall apart into single letters: "S.A." is "s a", "o.o."
    // is "o o". A run of them is joined back into the abbreviation it is.
    const words: string[] = [];
    let inRun = false;
    for (const token of tokens) {
        if (token.length === 1 && inRun) words[words.length - 1] += token;
        else words.push(token);
        inRun = token.length === 1;
    }
    const meaningful = words.filter((word) => !LEGAL_FORMS.has(word));
    return (meaningful.length ? meaningful : words).join(" ");
};

/** Whole days from `now` (UTC date) to the end of `expires`. Negative once it has lapsed. */
const daysLeft = (expires: string, now: Date): number => {
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.round((Date.parse(`${expires}T00:00:00Z`) - today) / 86_400_000);
};

/**
 * What to do with a request, given everything issued so far. Pure, so the rules are
 * tested without a file.
 */
export const decide = (entries: readonly LedgerEntry[], email: string, company: string, now: Date): LicenseDecision => {
    const domain = emailDomain(email);
    if (isPersonalDomain(domain)) return { action: "manual", reason: "personal_email" };

    const address = email.trim().toLowerCase();
    const companyKey = normaliseCompany(company);
    // Newest first: a renewal supersedes the key before it.
    const active = entries
        .filter((entry) => daysLeft(entry.expires, now) >= 0)
        .sort((a, b) => b.expires.localeCompare(a.expires));

    const sameOrganisation = active.find((entry) => entry.domain === domain || entry.email === address);
    if (sameOrganisation) {
        if (daysLeft(sameOrganisation.expires, now) <= RENEWAL_WINDOW_DAYS) return { action: "issue" };
        return { action: "resend", entry: sameOrganisation };
    }

    const sameName = active.find((entry) => entry.companyKey === companyKey);
    if (sameName && daysLeft(sameName.expires, now) > RENEWAL_WINDOW_DAYS) {
        return { action: "manual", reason: "company_has_licence" };
    }
    return { action: "issue" };
};

/** The record of issued free licences, in memory and, when given a path, on disk. */
export class LicenseLedger {
    private readonly entries: LedgerEntry[] = [];
    private queue: Promise<unknown> = Promise.resolve();

    /** `file` null keeps the ledger in memory only - for tests. */
    constructor(private readonly file: string | null) {
        if (!file) return;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        // Fail at startup, not on the first licence, when the file cannot be written.
        fs.appendFileSync(file, "");
        const lines = fs.readFileSync(file, "utf8").split("\n");
        lines.forEach((line, index) => {
            if (!line.trim()) return;
            try {
                this.entries.push(JSON.parse(line) as LedgerEntry);
            } catch {
                console.error(`[mailer] ledger: line ${index + 1} of ${file} is not JSON, skipped`);
            }
        });
    }

    get size(): number {
        return this.entries.length;
    }

    decide(email: string, company: string, now: Date): LicenseDecision {
        return decide(this.entries, email, company, now);
    }

    record(email: string, company: string, expires: string, now: Date): LedgerEntry {
        const entry: LedgerEntry = {
            issuedAt: now.toISOString(),
            company,
            companyKey: normaliseCompany(company),
            email: email.trim().toLowerCase(),
            domain: emailDomain(email),
            expires,
        };
        if (this.file) fs.appendFileSync(this.file, `${JSON.stringify(entry)}\n`);
        this.entries.push(entry);
        return entry;
    }

    /**
     * Runs `task` after every earlier one has finished. Deciding and recording must not
     * interleave, or two requests from one company arriving together would both be
     * issued a key.
     */
    exclusive<T>(task: () => Promise<T>): Promise<T> {
        const run = this.queue.then(task, task);
        this.queue = run.catch(() => undefined);
        return run;
    }
}
