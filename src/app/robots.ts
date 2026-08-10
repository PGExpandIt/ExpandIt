import type { MetadataRoute } from "next";

// Emitted as a static out/robots.txt by `next build` with output: 'export'.
// Its main job is the Sitemap line: nothing else tells a crawler the sitemap exists.
const SITE = "https://vallus.eu";

// Required with output: 'export' - see the same note in sitemap.ts.
export const dynamic = "force-static";

const robots = (): MetadataRoute.Robots => ({
    rules: {
        userAgent: "*",
        allow: "/",
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
});

export default robots;
