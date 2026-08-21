// Node entry point. Bridges node:http to the Web-standard handler so the same
// handler code stays testable with Request/Response and no live socket.

import http from "node:http";
import { loadConfig } from "./config.js";
import { createHandler } from "./handler.js";
import { SmtpSender } from "./mailer.js";

const config = loadConfig();
const sender = new SmtpSender(config);
const handler = createHandler(config, sender);

const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);

    const request = new Request(`http://localhost${req.url ?? "/"}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: body.length && req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
    });

    const response = await handler(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(config.port, config.bindHost, () => {
    console.log(`[mailer] listening on http://${config.bindHost}:${config.port}`);
    console.log(`[mailer] SMTP ${config.smtp.host}:${config.smtp.port} as ${config.smtp.user}`);
    // Fail fast if the mailbox login is wrong — better here than on the first code.
    sender
        .verifyConnection()
        .then(() => console.log("[mailer] SMTP login OK"))
        .catch((error) => console.error("[mailer] SMTP login FAILED:", error.message));
});
