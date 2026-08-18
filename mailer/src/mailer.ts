// The actual SMTP send, via nodemailer to Infomaniak. Node-only (nodemailer opens
// a raw TCP/TLS socket), which is exactly why this lives off the edge.

import nodemailer, { type Transporter } from "nodemailer";
import type { Config } from "./config.js";

/** What the handler needs from a sender — a real one, or a fake in tests. */
export interface CodeSender {
    sendCode(email: string, code: string): Promise<void>;
    verifyConnection?(): Promise<void>;
}

export class SmtpSender implements CodeSender {
    private readonly transport: Transporter;
    private readonly config: Config;

    constructor(config: Config) {
        this.config = config;
        this.transport = nodemailer.createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.secure, // true = implicit TLS (465); false = STARTTLS (587)
            // On 587 nodemailer would otherwise fall back to plaintext when the
            // server does not advertise STARTTLS — and the mailbox password goes
            // out on that connection. Fail the send instead.
            requireTLS: !config.smtp.secure,
            auth: { user: config.smtp.user, pass: config.smtp.pass },
        });
    }

    /** Checks the SMTP login without sending anything — handy on startup / probe. */
    async verifyConnection(): Promise<void> {
        await this.transport.verify();
    }

    async sendCode(email: string, code: string): Promise<void> {
        const body = this.config.codeBody
            .replaceAll("{code}", code)
            .replaceAll("{minutes}", String(this.config.codeTtlMinutes));

        // `-- ` on its own line is the RFC 3676 signature delimiter: mail clients
        // fold what follows and leave it out of quoted replies. The trailing space
        // is part of it, not a stray one.
        const text = this.config.signature ? `${body}\n\n-- \n${this.config.signature}\n` : body;

        await this.transport.sendMail({
            from: { address: this.config.from, name: this.config.fromName },
            to: email,
            subject: this.config.codeSubject,
            text,
        });
    }
}
