// The article index. Adding a piece is two steps and nothing else:
//
//   1. copy the generated folder into public/articles/<slug>/ and the
//      self-contained file next to it as public/articles/<slug>-offline.html
//   2. prepend an entry below
//
// Every article ships in two shapes. The web one is an ordinary page: separate
// AVIF/WebP images with srcset, woff2 fonts with preload, roughly 90 kB of HTML.
// The offline one inlines all of that as base64 into a single ~2.7 MB file that
// opens on a machine with no network - a terrible page to serve and an excellent
// thing to hand a customer, which is why it is a download rather than the link.
//
// Both live under public/ rather than being Next routes, because the offline
// copy has to be byte-identical to what the generator produced.
//
// `published` is ISO yyyy-mm-dd. Both hrefs are derived from the slug, so they
// never drift from what is on disk.

export interface Article {
    /** File name in public/articles, without the .html extension. */
    slug: string;
    title: string;
    /** One or two sentences shown on the list page - not the article's own lede. */
    summary: string;
    published: string;
    readingMinutes: number;
    /** Free-form labels rendered as chips. Keep to three at most. */
    topics: string[];
    /** BCP 47 tag, used for the `hreflang` on the link. */
    language: string;
    /** Rounded size of the offline copy, shown on the download link. */
    offlineSize: string;
}

export const ARTICLES: Article[] = [
    {
        slug: "what-breaks-without-internet",
        title: "Everything that breaks the first time you unplug",
        summary:
            "A catalogue of what actually fails when a working suite is moved into a closed network: 64 MB of shared memory, fonts from a CDN, revocation checks, telemetry, clock drift - and the timeouts they all turn into.",
        published: "2026-09-21",
        readingMinutes: 6,
        topics: ["Closed environments", "Debugging", "Flakiness"],
        language: "en",
        offlineSize: "0.9 MB",
    },
    {
        slug: "updating-playwright-behind-air-gap",
        title: "The version you are on is the version you are stuck with",
        summary:
            "Playwright ships monthly while a transfer into a closed environment takes weeks: how to choose an upgrade cadence, what breaks when you jump several versions at once, and how to make a rollback a path change rather than another transfer.",
        published: "2026-09-14",
        readingMinutes: 5,
        topics: ["Closed environments", "Playwright", "Upgrades"],
        language: "en",
        offlineSize: "0.9 MB",
    },
    {
        slug: "internal-browser-mirror",
        title: "One tarball is a procedure, twenty is a problem",
        summary:
            "Serving Playwright browser archives from your own artifact repository once copying tarballs stops scaling: the layout the installer expects, and what it costs to keep the mirror current.",
        published: "2026-09-08",
        readingMinutes: 10,
        topics: ["Closed environments", "Playwright", "Artifact mirror"],
        language: "en",
        offlineSize: "1.3 MB",
    },
    {
        slug: "playwright-offline-install",
        title: "The browsers have to get there somehow",
        summary:
            "A complete procedure for installing Playwright browsers on a machine with no route to the internet: what to fetch, how to move it, how to verify it, and how to carry several versions so a rollback is not another transfer.",
        published: "2026-09-01",
        readingMinutes: 12,
        topics: ["Closed environments", "Playwright", "Offline install"],
        language: "en",
        offlineSize: "1.1 MB",
    },
    {
        slug: "testing-closed-environments",
        title: "The tests nobody on the outside will ever see",
        summary:
            "Automation, reporting and running test suites where there is no route to the internet: hermetic suites, self-contained reports, and who else ends up holding your test data.",
        published: "2026-08-26",
        readingMinutes: 25,
        topics: ["Closed environments", "Reporting", "Data sovereignty"],
        language: "en",
        offlineSize: "2.7 MB",
    },
];

/** The page a reader lands on. */
export const articleHref = (article: Article): string =>
    `/articles/${article.slug}/`;

/** The single-file copy, for reading without a network. */
export const articleOfflineHref = (article: Article): string =>
    `/articles/${article.slug}-offline.html`;

/** Newest first, which is the order the list page renders. */
export const articlesByDate = (): Article[] =>
    [...ARTICLES].sort((a, b) => b.published.localeCompare(a.published));

/** en-GB rather than en-US: the site's copy is British-spelled throughout. */
export const formatPublished = (iso: string): string =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    });
