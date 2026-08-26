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
