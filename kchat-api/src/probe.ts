// Send one real message to the configured kChat channel and print the result.
//
// Use it once after wiring up the webhook (or bot token) to confirm the message
// actually lands where you expect, before pointing the website at the service.
//
//   node --env-file=.env dist/probe.js
//   node --env-file=.env dist/probe.js "a custom body"
//
// It posts a message. Nothing else.

import { loadConfig } from "./config.js";
import { KChat } from "./kchat.js";

const config = loadConfig();
const kchat = new KChat(config);

const main = async () => {
    const body = process.argv[2] ?? "Test message from kchat-api probe. If you can read this, the relay works.";
    console.log(`- transport -\n  ${kchat.transport}`);

    const text = [`**${config.messagePrefix}**`, "", body].join("\n");
    console.log("\n- sending -");
    const result = await kchat.send({ text });
    console.log(`  delivered via ${result.transport}. Check the kChat channel.`);
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
