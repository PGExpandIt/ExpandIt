// Entry point. The same file runs in both places:
//
//   • Bunny Edge Scripting (Deno) — serve() with no listener; Bunny owns the socket
//   • locally under Node          — serve({port, hostname}) when PORT is set
//
// The SDK ships a Node build (package exports "node": esm-node/lib.mjs), so local
// development needs no Deno install.

import * as BunnySDK from "@bunny.net/edgescript-sdk";
import { loadConfig, readEnv } from "./config.js";
import { createHandler } from "./handler.js";
import { KChat } from "./kchat.js";

const config = loadConfig();
const kchat = new KChat(config);
const handler = createHandler(config, kchat);

// PORT is set for local runs and absent on the edge, where Bunny provides the socket.
const localPort = readEnv("PORT") ? Number(readEnv("PORT")) : null;

if (localPort) {
    console.log(`[kchat-api] local server on http://127.0.0.1:${localPort}`);
    console.log(`[kchat-api] transport ${kchat.transport}, origins ${config.allowedOrigins.join(", ")}`);
    BunnySDK.net.http.serve({ port: localPort, hostname: "127.0.0.1" }, handler);
} else {
    console.log(`[kchat-api] edge mode, transport ${kchat.transport}`);
    BunnySDK.net.http.serve(handler);
}
