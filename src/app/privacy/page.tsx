import React from "react";
import type { Metadata } from "next";
import { LegalPage, Section, Table } from "@/components/legalPage";

export const metadata: Metadata = {
    title: "Privacy notice — vallus | ExpandIt",
    description:
        "How ExpandIt handles personal data under Article 13 GDPR: controller, purposes, legal bases, recipients, retention periods and your rights.",
    alternates: {
        canonical: "/privacy/",
        languages: { en: "/privacy/", pl: "/privacy/pl/" },
    },
};

export default function Privacy() {
    return (
        <LegalPage
            lang="en"
            title="Privacy notice"
            subtitle={
                <>
                    Information about the processing of personal data, under Article 13 of
                    Regulation (EU) 2016/679 (GDPR). Version 1.0, effective 2 August 2026.
                </>
            }
            backLabel="← Back to the site"
            otherLanguage={{ href: "/privacy/pl/", label: "Polski", lang: "pl" }}
            footnote={
                <>
                    This document describes what the site actually does, verified in the code and in
                    a browser: no cookies, no analytics, no third-party requests. It has not been
                    reviewed by a lawyer. A Polish translation is available at{" "}
                    <a
                        href="/privacy/pl/"
                        className="text-bone underline decoration-line underline-offset-4 hover:decoration-accent"
                    >
                        /privacy/pl
                    </a>
                    ; where the two differ, this English version prevails.
                </>
            }
        >
            <Section title="1. Who the controller is">
                <p>
                    The controller of your personal data is{" "}
                    <strong className="text-bone">Piotr Gajownik — ExpandIt</strong>, ul. Paryska
                    20B, 44-240 Żory, Poland, tax identification number (NIP) 5321875710 (EU VAT:
                    PL5321875710), referred to below as &quot;we&quot; or &quot;the controller&quot;.
                </p>
                <p>
                    For anything concerning personal data, write to{" "}
                    <a
                        href="mailto:support@vallus.eu"
                        className="text-bone underline decoration-line underline-offset-4 hover:decoration-accent"
                    >
                        support@vallus.eu
                    </a>
                    .
                </p>
                <p>
                    We have not appointed a data protection officer; we are not required to. All
                    matters are handled at the address above.
                </p>
            </Section>

            <Section title="2. What we collect, and where it comes from">
                <p>
                    We collect only what you type into the demo booking form on this site. We do not
                    buy data, do not obtain it from external databases, and do not profile visitors.
                </p>
                <Table
                    head={["Data", "Required"]}
                    rows={[
                        ["Name", "yes"],
                        ["Work e-mail address", "yes"],
                        ["Company name", "no"],
                        ["Phone number", "no"],
                        ["Number of people who would use the product", "no"],
                        ["Topic and message", "no"],
                        ["Preferred meeting slot", "no"],
                    ]}
                />
                <p>
                    If the booking service is temporarily unavailable, the form opens your own e-mail
                    client with the request filled in. In that case nothing leaves your device until
                    you send the message yourself.
                </p>
            </Section>

            <Section title="3. Why we process it, and on what legal basis">
                <Table
                    head={["Purpose", "Legal basis", "Retention"]}
                    rows={[
                        [
                            "Arranging and holding a product demonstration, answering your enquiry",
                            "Art. 6(1)(b) GDPR — steps taken at your request before entering into a contract",
                            "6 months from the last contact",
                        ],
                        [
                            "Sales contact and keeping in touch with a prospective customer",
                            "Art. 6(1)(f) GDPR — our legitimate interest in selling our own product",
                            "until you object, and no longer than 6 months from the last contact",
                        ],
                        [
                            "Entering into and performing a licence agreement, invoicing",
                            "Art. 6(1)(b) and (c) GDPR — tax and accounting obligations",
                            "the period required by law, as a rule 5 years from the end of the tax year",
                        ],
                        [
                            "Establishing or defending legal claims",
                            "Art. 6(1)(f) GDPR",
                            "until the claims become time-barred",
                        ],
                    ]}
                />
                <p>
                    Providing the data is voluntary, but without a name and an e-mail address we
                    cannot arrange a meeting or reply to an enquiry. Every other field may be left
                    empty.
                </p>
            </Section>

            <Section title="4. Who else sees the data">
                <p>
                    We do not sell data and do not share it for marketing purposes. We do use
                    providers who process it on our behalf, under data processing agreements
                    concluded in accordance with Article 28 GDPR:
                </p>
                <Table
                    head={["Provider", "Country", "Scope"]}
                    rows={[
                        [
                            "BunnyWay d.o.o., Dunajska cesta 165, 1000 Ljubljana",
                            "Slovenia (EU)",
                            "hosting of the site and of the service that receives bookings",
                        ],
                        [
                            "Infomaniak Network SA",
                            "Switzerland",
                            "the calendar the meeting is created in, and e-mail",
                        ],
                    ]}
                />
                <p>
                    Switzerland is covered by a European Commission adequacy decision (Art. 45
                    GDPR), and Infomaniak stores the data exclusively in Switzerland. We do not
                    transfer data to countries without such a decision, in particular not to the
                    United States.
                </p>
                <p>
                    Data may also be disclosed to public authorities where they are entitled to
                    request it by law.
                </p>
            </Section>

            <Section title="5. Cookies and anything stored in your browser">
                <p>
                    <span className="text-bone">This site sets no cookies.</span> We use no
                    analytics, embed nothing from third-party services, and make no requests outside
                    our own infrastructure. Typefaces are served from the site itself rather than
                    fetched from an external server.
                </p>
                <p>
                    The only thing we store in your browser is a note that you have dismissed the
                    privacy message, so that it is not shown on every visit. It is kept in local
                    storage, is not a cookie, does not identify you, and you can remove it at any
                    time by clearing site data in your browser settings.
                </p>
                <p>
                    If we ever add tools that require your consent, we will ask for it separately,
                    before anything is loaded.
                </p>
            </Section>

            <Section title="6. Your rights">
                <p>In relation to this processing you have the right to:</p>
                <ul className="ml-5 list-disc space-y-1">
                    <li>access your data and obtain a copy of it,</li>
                    <li>have inaccurate data corrected and incomplete data completed,</li>
                    <li>have your data erased,</li>
                    <li>restrict the processing,</li>
                    <li>port your data to another controller,</li>
                    <li>
                        object to processing based on our legitimate interest — including to sales
                        contact.
                    </li>
                </ul>
                <p>
                    To exercise any of these, write to{" "}
                    <a
                        href="mailto:support@vallus.eu"
                        className="text-bone underline decoration-line underline-offset-4 hover:decoration-accent"
                    >
                        support@vallus.eu
                    </a>
                    . We reply without undue delay and within one month at the latest.
                </p>
                <p>
                    You also have the right to lodge a complaint with a supervisory authority. Ours
                    is the President of the Personal Data Protection Office (Prezes Urzędu Ochrony
                    Danych Osobowych), ul. Stawki 2, 00-193 Warsaw, Poland.
                </p>
            </Section>

            <Section title="7. Automated decisions and profiling">
                <p>
                    We take no automated decisions about you and do not profile you. The meeting
                    slots you see in the form come solely from what is free in our calendar — they
                    do not depend on who you are or where you are visiting from.
                </p>
            </Section>

            <Section title="8. Changes to this notice">
                <p>
                    If we change how we process data, we will update this document and the effective
                    date shown at the top. Where the change is significant, we will tell the people
                    we are in contact with.
                </p>
            </Section>
        </LegalPage>
    );
}
