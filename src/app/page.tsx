import Header from "@/components/header";
import Hero from "@/components/hero";
import Origin from "@/components/origin";
import Problem from "@/components/problem";
import Features from "@/components/features";
import HowItWorks from "@/components/howItWorks";
import Integrations from "@/components/integrations";
import Development from "@/components/development";
import Deployment from "@/components/deployment";
import Pricing from "@/components/pricing";
import Faq from "@/components/faq";
import Manufacturer from "@/components/manufacturer";
import DemoBooking from "@/components/demoBooking";
import Footer from "@/components/footer";
import CookieNotice from "@/components/cookieNotice";

export default function Home() {
    return (
        <div className="min-h-screen bg-ink">
            <Header />
            <main id="main" tabIndex={-1} className="focus:outline-none">
                <Hero />
                <Origin />
                <Problem />
                <Features />
                <HowItWorks />
                <Integrations />
                <Development />
                <Deployment />
                <Pricing />
                <Faq />
                <Manufacturer />
                <DemoBooking />
            </main>
            <Footer />
            <CookieNotice />
        </div>
    );
}
