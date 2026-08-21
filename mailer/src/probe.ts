// Verify the SMTP login and send one real code to an address you pass in. Use it
// once after wiring up the mailbox, before pointing the edge at this service.
//
//   node --env-file=.env dist/probe.js you@example.com
//
// It sends one e-mail. Nothing else.

import { loadConfig } from "./config.js";
import { SmtpSender } from "./mailer.js";

const config = loadConfig();
const sender = new SmtpSender(config);

const main = async () => {
    const to = process.argv[2];
    if (!to) throw new Error("Usage: node dist/probe.js <recipient-email>");

    console.log(`— SMTP ${config.smtp.host}:${config.smtp.port} as ${config.smtp.user} —`);
    await sender.verifyConnection();
    console.log("  login OK");

    const code = String(Math.floor(100000 + Math.random() * 900000));
    console.log(`\n— sending code ${code} to ${to} —`);
    await sender.sendCode(to, code);
    console.log("  sent. Check the inbox (and spam).");
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
