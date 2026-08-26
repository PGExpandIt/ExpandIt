// Client for Infomaniak kChat - Infomaniak's hosted Mattermost. Two transports,
// picked by which secrets are configured (see config.ts):
//
//   • Incoming webhook (default). POST a JSON payload to the webhook URL:
//       https://<org>.kchat.infomaniak.com/hooks/<id>
//     Body: { text, channel?, username?, icon_emoji? }. No auth header - the URL
//     itself is the secret. This is the Mattermost incoming-webhook contract.
//
//   • Bot / personal-access token. POST /api/v4/posts with a bearer token:
//       Body: { channel_id, message }
//     Used only when no webhook URL is set. Posts as the token's own identity, so
//     username / icon overrides do not apply.
//
// The token and the webhook URL are secrets: neither must ever appear in an error
// surfaced to a caller, and the URL is redacted even in the local logs.

import type { Config } from "./config.js";

export interface KChatMessage {
    /** Message body, in Mattermost markdown. */
    text: string;
    /** Channel name override (webhook transport only). */
    channel?: string | null;
    /** Sender name override (webhook transport only). */
    username?: string | null;
    /** Sender icon emoji override (webhook transport only). */
    iconEmoji?: string | null;
}

export type Transport = "webhook" | "api";

/** Host only, so a leaked log line cannot rebuild the secret webhook URL. */
const redact = (url: string): string => {
    try {
        return new URL(url).host;
    } catch {
        return "kchat";
    }
};

export class KChat {
    private readonly webhookUrl: string | null;
    private readonly apiBase: string | null;
    private readonly channelId: string | null;
    private readonly authHeaders: Record<string, string> | null;
    private readonly defaults: { channel: string | null; username: string | null; iconEmoji: string | null };

    constructor(config: Config) {
        this.webhookUrl = config.webhookUrl;
        this.apiBase = config.apiBase;
        this.channelId = config.channelId;
        this.authHeaders = config.token ? { Authorization: `Bearer ${config.token}` } : null;
        this.defaults = {
            channel: config.defaultChannel,
            username: config.username,
            iconEmoji: config.iconEmoji,
        };
    }

    /** Which transport a send() would use, given how the client was configured. */
    get transport(): Transport {
        return this.webhookUrl ? "webhook" : "api";
    }

    async send(message: KChatMessage): Promise<{ transport: Transport }> {
        if (this.webhookUrl) {
            await this.sendViaWebhook(this.webhookUrl, message);
            return { transport: "webhook" };
        }
        await this.sendViaApi(message);
        return { transport: "api" };
    }

    private async sendViaWebhook(url: string, message: KChatMessage): Promise<void> {
        const payload: Record<string, unknown> = { text: message.text };
        const channel = message.channel ?? this.defaults.channel;
        const username = message.username ?? this.defaults.username;
        const iconEmoji = message.iconEmoji ?? this.defaults.iconEmoji;
        if (channel) payload.channel = channel;
        if (username) payload.username = username;
        if (iconEmoji) payload.icon_emoji = iconEmoji;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const body = await response.text();
        if (!response.ok) {
            // Redacted host, not the full URL: the path is the secret.
            throw new Error(`kChat webhook ${redact(url)} → ${response.status}: ${body.slice(0, 300)}`);
        }
    }

    private async sendViaApi(message: KChatMessage): Promise<void> {
        if (!this.apiBase || !this.channelId || !this.authHeaders) {
            throw new Error("kChat token transport is not fully configured");
        }
        const response = await fetch(`${this.apiBase}/api/v4/posts`, {
            method: "POST",
            headers: { ...this.authHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ channel_id: this.channelId, message: message.text }),
        });
        const body = await response.text();
        if (!response.ok) {
            // The token lives in a header, never in the message; the body may still
            // echo request detail, so it is truncated and kept out of caller-facing
            // responses by the handler.
            throw new Error(`kChat POST /api/v4/posts → ${response.status}: ${body.slice(0, 300)}`);
        }
    }
}
