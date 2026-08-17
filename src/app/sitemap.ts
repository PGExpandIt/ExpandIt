import type { MetadataRoute } from "next";

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
        {
            url: `${SITE}/privacy/`,
            lastModified,
            changeFrequency: "yearly",
            priority: 0.3,
            alternates: {
                languages: {
                    en: `${SITE}/privacy/`,
                    pl: `${SITE}/privacy/pl/`,
                },
            },
        },
        {
            url: `${SITE}/privacy/pl/`,
            lastModified,
            changeFrequency: "yearly",
            priority: 0.3,
            alternates: {
                languages: {
                    en: `${SITE}/privacy/`,
                    pl: `${SITE}/privacy/pl/`,
                },
            },
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
    ];
};

export default sitemap;
