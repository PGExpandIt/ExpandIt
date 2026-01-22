import Header from "@/components/header";
import ContactInformation from "@/components/contactInformation";
import ToolsList from "@/components/toolList";

const COMMON_STYLES = {
    container: "max-w-[850px] w-full",
    sectionTitle: "text-2xl font-semibold text-white",
    paragraph: "text-gray-100 mt-4 mx-8",
};


export default function Home() {
    return (
        <div className="flex flex-col items-center min-h-screen p-8 bg-gradient-to-b from-blue-400 to-blue-700">
            <Header/>
            <main className={`text-center flex-grow ${COMMON_STYLES.container}`}>
                <section className="mb-8">
                    <h2 className={COMMON_STYLES.sectionTitle}>About Me</h2>
                    <p className={COMMON_STYLES.paragraph}>
                        For over 17 years, I have been involved in software testing, primarily through functional tests
                        for user interfaces. However, I am also familiar with other types of tests, such as unit,
                        integration, performance, and stress tests. For all these tests, I use various free tools,
                        though recently I have been focusing mainly on Playwright using TypeScript.
                    </p>
                </section>
                <section className="mb-8">
                    <h2 className="text-2xl font-semibold text-white">Test automation</h2>
                    <p className={COMMON_STYLES.paragraph}>
                        Last 10 years, I have been involved in test automation. I have worked with various frameworks
                        and tools, such as:
                    </p>
                    <ToolsList/>
                </section>

                <section className="mb-8">
                    <ContactInformation styles={COMMON_STYLES}/>
                </section>
            </main>
            <footer className={`text-center text-white text-sm ${COMMON_STYLES.container}`}>
                &copy; {new Date().getFullYear()} Piotr Gajownik - ExpandIt. All rights reserved.
            </footer>
        </div>
    );
}