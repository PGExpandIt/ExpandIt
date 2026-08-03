import React from "react";
import VallusMark from "@/components/vallusMark";

const Origin = () => (
    <section id="about" className="border-b border-line bg-ink-soft">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 sm:py-24 lg:grid-cols-[1fr_1.4fr]">
            <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-accent">
                    About the product
                </p>
                <div className="mt-6 rounded-lg border border-line bg-surface p-8">
                    <VallusMark className="h-14 w-auto text-accent" />
                    <p className="mt-6 text-2xl font-semibold text-bone">
                        vallus <span className="font-normal text-muted">/ˈva.lʊs/</span>
                    </p>
                    <p className="mt-1 text-sm italic text-muted">noun, Latin</p>
                    <p className="mt-4 text-sm leading-relaxed text-muted">
                        A sharpened stake driven into the crown of a rampart. In the plural,{" "}
                        <span className="italic text-bone">valli</span>: a palisade.
                    </p>
                </div>
            </div>

            <div className="space-y-6 text-lg leading-relaxed text-muted lg:pt-16">
                <p>
                    Roman legionaries carried their stakes with them. The camp was not delivered — it
                    was raised each evening from what every man had brought, and taken down again at
                    dawn. The defence worked because it required nothing from outside the column.
                </p>
                <p>
                    That is the model Vallus is built on. Each deployment is a self-contained
                    instance: the runner, the dashboard, reporting and access control, all on your
                    own machine from the first minute. It runs inside networks with no route to the
                    internet, and it does not phone home — the licence is verified locally, by
                    signature, with nothing to check in with.
                </p>
                <p className="text-bone">
                    Every engineer on the team drives their own stake. The perimeter is what you
                    build together.
                </p>
            </div>
        </div>
    </section>
);

export default Origin;
