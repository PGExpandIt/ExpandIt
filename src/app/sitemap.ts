import type { MetadataRoute } from "next";
import { articleHref, articlesByDate } from "@/lib/articles";

// Emitted as a static out/sitemap.xml by `next build` with output: 'export'.
// URLs keep the trailing slash because next.config.ts sets trailingSlash: true -
// a sitemap that lists a different form than the site serves earns a redirect on
// every crawl.
const SITE = "https://vallus.eu";

// Required with output: 'export' - without it the build fails rather than
// emitting the file, because Next will not assume a metadata route is static.
export const dynamic = "force-static";

const sitemap = (): MetadataRoute.Sitemap => {
    const lastModified = new Date();

    return [
        {
            url: `${SITE}/`,
            lastModified,
            changeFrequency: "monthly",
            priority: 1,
        },
        // No `alternates` here on purpose. Next emits xhtml:link before <lastmod>,
        // which breaks the element order the sitemap 0.9 schema requires and makes
        // the whole file fail validation. Both privacy pages already carry the same
        // hreflang pair as <link rel="alternate"> in their <head>, so the sitemap
        // was only repeating a signal Google reads there anyway.
        {
            url: `${SITE}/privacy/`,
            lastModified,
            changeFrequency: "yearly",
            priority: 0.3,
        },
        {
            url: `${SITE}/privacy/pl/`,
            lastModified,
            changeFrequency: "yearly",
            priority: 0.3,
        },
        {
            url: `${SITE}/free/`,
            lastModified,
            changeFrequency: "monthly",
            priority: 0.8,
        },
        {
            url: `${SITE}/licenses/`,
            lastModified,
            changeFrequency: "yearly",
            priority: 0.3,
        },
        {
            url: `${SITE}/legal/eula/`,
            lastModified,
            changeFrequency: "yearly",
            priority: 0.3,
        },
        {
            url: `${SITE}/articles/`,
            lastModified,
            changeFrequency: "monthly",
            priority: 0.6,
        },
        // Only the readable version is listed: the offline copy is the same text
        // at a second URL, and a sitemap that offers both invites a duplicate.
        ...articlesByDate().map((article) => ({
            url: `${SITE}${articleHref(article)}`,
            lastModified: new Date(`${article.published}T00:00:00Z`),
            changeFrequency: "yearly" as const,
            priority: 0.5,
        })),
    ];
};

export default sitemap;
