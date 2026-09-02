// The EULA text, read from the file that actually ships with the product.
//
// public/legal/vallus-eula.txt is a copy of the LICENSE in the distribution
// archive, and this module parses it at build time. Transcribing the clauses
// into JSX would have been less work once and wrong forever: the page and the
// shipped file would drift the first time one of them was edited, and for a
// licence that difference is the whole question. If they ever disagree, the file
// in the customer's archive is the one that binds - which is why the page also
// links the raw text.

import fs from "fs";
import path from "path";

export interface Clause {
    /** "2.2", "11.5", or "" for a paragraph that carries no number. */
    number: string;
    text: string;
    /** Sub-points rendered as a list: "(a) ...", "(b) ...". */
    items: string[];
}

export interface EulaSection {
    /** "1", "2", ... */
    number: string;
    title: string;
    clauses: Clause[];
}

export interface Eula {
    title: string;
    /** The banner above the rule: copyright, draft status. */
    preamble: string[];
    sections: EulaSection[];
    /** Everything, verbatim, for the download link and for anyone who wants it raw. */
    raw: string;
}

const SOURCE = path.join(process.cwd(), "public", "legal", "vallus-eula.txt");

/** Joins the hard-wrapped 80-column lines of one block back into a paragraph. */
const unwrap = (lines: string[]): string => lines.join(" ").replace(/\s+/g, " ").trim();

export function readEula(): Eula {
    const raw = fs.readFileSync(SOURCE, "utf8");
    const lines = raw.split("\n");

    const rule = lines.findIndex((l) => /^-{20,}$/.test(l.trim()));
    const preamble = lines
        .slice(0, rule === -1 ? 0 : rule)
        .map((l) => l.trim())
        .filter(Boolean);
    const title = preamble.shift() ?? "End User Licence Agreement";

    const sections: EulaSection[] = [];
    let block: string[] = [];
    let items: string[] = [];

    /** Emits whatever is buffered as one clause, with its list attached.
     *
     *  The list has to travel with the paragraph that introduces it. An earlier
     *  version emitted the paragraph as soon as the first "(a)" appeared, so
     *  clause 10.2 lost its two limbs and they turned up as a numberless clause
     *  of their own - which reads, in a liability cap, as though the cap had no
     *  content. */
    const flush = () => {
        const section = sections[sections.length - 1];
        if (!section) {
            block = [];
            items = [];
            return;
        }
        const text = unwrap(block);
        if (text || items.length) {
            const m = /^(\d+\.\d+)\s+(.*)$/.exec(text);
            section.clauses.push({
                number: m ? m[1] : "",
                text: m ? m[2] : text,
                items,
            });
        }
        block = [];
        items = [];
    };

    // A blank line does NOT close the clause on its own. In this document a list
    // is separated from the paragraph that introduces it by exactly such a line:
    //
    //     2.1 ... licence to install and use the Software:
    //                                     <- blank
    //       - (a) in production ...
    //
    // Closing on the blank line detached every list from its clause, so 10.2
    // rendered as a liability cap with no limbs and the limbs turned up as a
    // numberless clause below it. The buffer is therefore closed lazily: when the
    // next thing that arrives is ordinary text or a heading, never on whitespace.
    let paragraphEnded = false;

    for (const line of lines.slice(rule + 1)) {
        const trimmed = line.trim();
        if (/^-{3,}$/.test(trimmed)) continue; // closing rule at the end of the file

        const heading = /^(\d+)\.\s+([A-Z].*)$/.exec(trimmed);
        if (heading && !line.startsWith(" ") && !/\.$/.test(trimmed)) {
            flush();
            paragraphEnded = false;
            sections.push({ number: heading[1], title: heading[2], clauses: [] });
            continue;
        }

        const bullet = /^-?\s*\(([a-z])\)\s+(.*)$/.exec(trimmed);
        if (bullet) {
            items.push(`(${bullet[1]}) ${bullet[2]}`);
            paragraphEnded = false;
            continue;
        }

        if (!trimmed) {
            paragraphEnded = true;
            continue;
        }

        // Indented continuation of the item above.
        if (items.length && !paragraphEnded && line.startsWith("  ")) {
            items[items.length - 1] += " " + trimmed;
            continue;
        }

        // Ordinary text after a break closes whatever was open.
        if (paragraphEnded && (block.length || items.length)) flush();
        paragraphEnded = false;
        block.push(trimmed);
    }
    flush();

    return { title, preamble, sections, raw };
}

/** True while the shipped file still carries the draft banner. Drives the warning
 *  on the page, so the notice cannot be forgotten once the banner is removed. */
export const isDraft = (eula: Eula): boolean =>
    eula.preamble.some((line) => /\bDRAFT\b/.test(line));
