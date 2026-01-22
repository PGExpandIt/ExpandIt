"use client";

import React, {useState} from 'react';

interface CommonStyles {
    sectionTitle: string;
    paragraph: string;
}

interface ContactProps {
    styles: CommonStyles;
}

const ContactInformation = ({styles}: ContactProps) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const contentId = "contact-info-panel";
    const titleId = "contact-info-title";

    return (
        <div>
            <h2 id={titleId} className={styles.sectionTitle}>Contact Information</h2>
            <button
                type="button"
                className="flex items-center justify-center cursor-pointer gap-2 focus:outline-none focus-visible:ring focus-visible:ring-white/70 rounded px-2 py-1 mx-auto mt-2"
                aria-expanded={isExpanded}
                aria-controls={contentId}
                aria-labelledby={titleId}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="text-xl" aria-hidden="true">
                    {isExpanded ? '▼' : '▶'}
                </span>
                <span className="text-white">{isExpanded ? 'Hide details' : 'Show details'}</span>
            </button>

            {isExpanded && (
                <div
                    id={contentId}
                    role="region"
                    aria-labelledby={titleId}
                    className="mt-4"
                >
                    <p className={styles.paragraph}>In case of questions, contact me:</p>
                    <ul className="mt-4 space-y-2 text-white mx-8">
                        <li>
                            <strong>Email:</strong>{' '}
                            <a
                                href="mailto:gajownikp@gmail.com"
                                className="underline hover:no-underline"
                            >
                                gajownikp@gmail.com
                            </a>
                        </li>
                        <li>
                            <strong>Phone:</strong>{' '}
                            <a
                                href="tel:+48504008035"
                                className="underline hover:no-underline"
                            >
                                +48 504-008-035
                            </a>
                        </li>
                        <li>
                            <strong>LinkedIn:</strong>{' '}
                            <a href="https://www.linkedin.com/in/piotr-gajownik-a1515a65/"
                               className="text-white underline hover:no-underline"
                               target="_blank"
                               rel="noopener noreferrer"
                               aria-label="Open LinkedIn profile (opens in a new tab)"
                            >
                                Piotr Gajownik
                            </a>
                        </li>
                    </ul>
                </div>
            )}
        </div>
    );
};

export default ContactInformation;