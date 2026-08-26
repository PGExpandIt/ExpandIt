// Runs the website and the booking API together, wired to each other.
//
//   npm run dev:all     → site on :3100, booking API on :8787
//
// Doing it by hand needs two terminals and three things kept in sync: the site's
// NEXT_PUBLIC_BOOKING_API, the API's ALLOWED_ORIGINS, and the port Next actually
// picked (it moves when one is taken, which silently breaks CORS). This pins them.
//
// The API is optional. Without booking-api/.env it will not start, and the site
// falls back to the example calendar and a mailto request - exactly what a plain
// GitHub Pages deployment does.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = join(ROOT, "booking-api");

const SITE_PORT = Number(process.env.SITE_PORT ?? 3100);
const API_PORT = Number(process.env.API_PORT ?? 8787);
const SITE_ORIGIN = `http://localhost:${SITE_PORT}`;
const API_ORIGIN = `http://localhost:${API_PORT}`;

const children = [];

const run = (label, command, args, options = {}) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    children.push(child);

    const prefix = (stream, target) =>
        stream.on("data", (chunk) => {
            for (const line of String(chunk).split("\n")) {
                if (line.trim()) target.write(`[${label}] ${line}\n`);
            }
        });
    prefix(child.stdout, process.stdout);
    prefix(child.stderr, process.stderr);
    return child;
};

const runToCompletion = (label, command, args, options) =>
    new Promise((resolveRun, rejectRun) => {
        const child = run(label, command, args, options);
        child.on("exit", (code) =>
            code === 0 ? resolveRun() : rejectRun(new Error(`${label} exited with ${code}`)),
        );
    });

const shutdown = () => {
    for (const child of children) child.kill("SIGTERM");
    process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const main = async () => {
    const hasApiEnv = existsSync(join(API_DIR, ".env"));

    if (hasApiEnv) {
        console.log(`[dev:all] building booking-api…`);
        try {
            await runToCompletion("api-build", "npm", ["run", "build"], { cwd: API_DIR });
            // --env-file, not a loader in the app: on Bunny Edge Scripting there is no
            // filesystem, so config.ts reads the environment and nothing else.
            run("api", "node", ["--env-file=.env", "dist/edge.js"], {
                cwd: API_DIR,
                env: {
                    ...process.env,
                    PORT: String(API_PORT),
                    // Overrides booking-api/.env, which points at production.
                    ALLOWED_ORIGINS: SITE_ORIGIN,
                },
            });
        } catch (error) {
            console.error(`[dev:all] booking-api failed to build: ${error.message}`);
            console.error(`[dev:all] carrying on - the site will use its offline fallback.`);
        }
    } else {
        console.log(`[dev:all] no booking-api/.env - starting the site only.`);
        console.log(`[dev:all] the demo section will use the example calendar and mailto.`);
    }

    run("site", "npx", ["next", "dev", "--turbopack", "-p", String(SITE_PORT)], {
        cwd: ROOT,
        env: {
            ...process.env,
            // Only point the site at the API if there is one to point at.
            ...(hasApiEnv ? { NEXT_PUBLIC_BOOKING_API: API_ORIGIN } : {}),
        },
    });

    console.log(`\n[dev:all] site  → ${SITE_ORIGIN}`);
    if (hasApiEnv) console.log(`[dev:all] api   → ${API_ORIGIN}/slots`);
    console.log(`[dev:all] stop with Ctrl-C\n`);
};

main();
