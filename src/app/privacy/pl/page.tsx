import React from "react";
import type { Metadata } from "next";
import { LegalPage, Section, Table } from "@/components/legalPage";

export const metadata: Metadata = {
    title: "Polityka prywatności - vallus | ExpandIt",
    description:
        // Maksymalnie 160 znaków - dłuższy opis Google i tak ucina.
        "Informacja o przetwarzaniu danych osobowych zgodnie z art. 13 RODO: administrator, cele, podstawy prawne, odbiorcy, okresy przechowywania i Twoje prawa.",
    alternates: {
        canonical: "/privacy/pl/",
        languages: { en: "/privacy/", pl: "/privacy/pl/" },
    },
};

export default function PrivacyPl() {
    return (
        <LegalPage
            lang="pl"
            title="Polityka prywatności"
            subtitle={
                <>
                    Informacja o przetwarzaniu danych osobowych, zgodnie z art. 13 rozporządzenia
                    (UE) 2016/679 (RODO). Wersja 1.0, obowiązuje od 2 sierpnia 2026 r.
                </>
            }
            backLabel="← Strona główna"
            otherLanguage={{ href: "/privacy/", label: "English", lang: "en" }}
            footnote={
                <>
                    Dokument opisuje stan faktyczny zweryfikowany w kodzie i w przeglądarce: brak
                    plików cookies, brak narzędzi analitycznych, brak zapytań do serwisów trzecich.
                    Treść nie została sprawdzona przez prawnika. W razie rozbieżności między wersją
                    polską a angielską rozstrzygająca jest{" "}
                    <a
                        href="/privacy/"
                        className="text-bone underline decoration-line underline-offset-4 hover:decoration-accent"
                    >
                        wersja angielska
                    </a>
                    .
                </>
            }
        >
                <Section title="1. Kto jest administratorem Twoich danych">
                    <p>
                        Administratorem danych osobowych jest <strong className="text-bone">Piotr
                        Gajownik - ExpandIt</strong>, ul. Paryska 20B, 44-240 Żory, Polska,
                        NIP 5321875710 (VAT UE: PL5321875710), dalej „my” lub
                        „administrator”.
                    </p>
                    <p>
                        Kontakt w sprawach dotyczących danych osobowych:{" "}
                        <a
                            href="mailto:support@vallus.eu"
                            className="text-bone underline decoration-line underline-offset-4 hover:decoration-accent"
                        >
                            support@vallus.eu
                        </a>
                        .
                    </p>
                    <p>
                        Nie wyznaczyliśmy inspektora ochrony danych - nie mamy takiego obowiązku.
                        Wszystkie sprawy prowadzimy pod powyższym adresem.
                    </p>
                </Section>

                <Section title="2. Jakie dane zbieramy i skąd">
                    <p>
                        Zbieramy wyłącznie dane, które sam nam podajesz, wypełniając jeden z trzech
                        formularzy na tej stronie: rezerwację demonstracji, wniosek o darmową
                        licencję albo formularz kontaktowy. Nie kupujemy danych, nie pobieramy ich
                        z zewnętrznych baz i nie profilujemy odwiedzających.
                    </p>
                    <Table
                        head={["Dane", "Rezerwacja demo", "Wniosek o licencję", "Kontakt"]}
                        rows={[
                            ["Imię i nazwisko", "wymagane", "-", "opcjonalne"],
                            ["Służbowy adres e-mail", "wymagane", "wymagane", "wymagane"],
                            ["Nazwa firmy", "opcjonalne", "wymagane", "-"],
                            ["Numer telefonu", "opcjonalne", "-", "-"],
                            ["Liczba osób, które miałyby korzystać z produktu", "opcjonalne", "-", "-"],
                            ["Temat rozmowy", "opcjonalne", "-", "opcjonalne"],
                            ["Treść wiadomości", "opcjonalne", "-", "wymagane"],
                            ["Wybrany termin spotkania", "opcjonalne", "-", "-"],
                        ]}
                    />
                    <p>
                        Wniosek o licencję jest jedynym miejscem, w którym nazwa firmy jest
                        obowiązkowa. Trafia ona do samego klucza licencyjnego, który wystawiamy na
                        oznaczonego licencjobiorcę, więc bez niej klucza nie da się wygenerować.
                        Jeśli poprosisz o usunięcie tych danych, darmowa licencja wygasa: klucz
                        przestaje być ważny, a na życzenie potwierdzimy jego usunięcie.
                    </p>
                    <p>
                        W formularzu licencyjnym znajduje się też opcjonalne pole zgody na
                        informacje o produkcie wysyłane e-mailem. Jest domyślnie niezaznaczone, nie ma
                        wpływu na wydanie licencji i możesz je w każdej chwili wycofać, pisząc na
                        adres z punktu 1.
                    </p>
                    <p>
                        Jeśli usługa rezerwacji jest chwilowo niedostępna, formularz otwiera Twojego
                        własnego klienta poczty z przygotowaną treścią. W takim przypadku nic nie
                        opuszcza Twojego urządzenia, dopóki sam nie wyślesz wiadomości.
                    </p>
                </Section>

                <Section title="3. W jakim celu i na jakiej podstawie prawnej">
                    <Table
                        head={["Cel", "Podstawa prawna", "Okres przechowywania"]}
                        rows={[
                            [
                                "Umówienie i przeprowadzenie demonstracji produktu, odpowiedź na zapytanie",
                                "art. 6 ust. 1 lit. b RODO - działania podejmowane na Twoje żądanie przed zawarciem umowy",
                                "6 miesięcy od ostatniego kontaktu",
                            ],
                            [
                                "Kontakt handlowy i utrzymanie relacji z potencjalnym klientem",
                                "art. 6 ust. 1 lit. f RODO - nasz prawnie uzasadniony interes polegający na prowadzeniu sprzedaży",
                                "do wniesienia sprzeciwu, nie dłużej niż 6 miesięcy od ostatniego kontaktu",
                            ],
                            [
                                "Zawarcie i wykonanie umowy licencyjnej, rozliczenia",
                                "art. 6 ust. 1 lit. b oraz lit. c RODO - obowiązki podatkowe i rachunkowe",
                                "przez okres wymagany przepisami, co do zasady 5 lat od końca roku podatkowego",
                            ],
                            [
                                "Wysyłka informacji o produkcie e-mailem, jeśli zaznaczysz zgodę",
                                "art. 6 ust. 1 lit. a RODO - Twoja zgoda",
                                "do czasu wycofania zgody",
                            ],
                            [
                                "Obrona przed roszczeniami lub ich dochodzenie",
                                "art. 6 ust. 1 lit. f RODO",
                                "do upływu terminu przedawnienia roszczeń",
                            ],
                        ]}
                    />
                    <p>
                        Podanie danych jest dobrowolne, ale każdy formularz ma minimum, bez którego
                        nie możemy zrealizować Twojej prośby: imię i nazwisko oraz adres e-mail, aby
                        umówić spotkanie, adres e-mail i treść wiadomości, aby odpowiedzieć na
                        zapytanie, oraz nazwę firmy wraz z adresem e-mail, aby wystawić klucz
                        licencyjny.
                        Pozostałe pola możesz zostawić puste.
                    </p>
                </Section>

                <Section title="4. Komu powierzamy dane">
                    <p>
                        Nie sprzedajemy danych i nie udostępniamy ich w celach marketingowych.
                        Korzystamy natomiast z dostawców, którzy przetwarzają dane w naszym imieniu,
                        na podstawie umów powierzenia zawartych zgodnie z art. 28 RODO:
                    </p>
                    <Table
                        head={["Podmiot", "Kraj", "Zakres"]}
                        rows={[
                            [
                                "BunnyWay d.o.o., Dunajska cesta 165, 1000 Lublana",
                                "Słowenia (UE)",
                                "hosting strony oraz usługi przyjmującej rezerwacje",
                            ],
                            [
                                "Infomaniak Network SA",
                                "Szwajcaria",
                                "kalendarz, w którym powstaje wydarzenie ze spotkaniem, poczta e-mail oraz wewnętrzny komunikator, do którego trafiają wiadomości z formularza kontaktowego",
                            ],
                        ]}
                    />
                    <p>
                        Szwajcaria jest objęta decyzją Komisji Europejskiej stwierdzającą odpowiedni
                        stopień ochrony danych (art. 45 RODO), a Infomaniak przechowuje powierzone
                        dane wyłącznie na terenie Szwajcarii. Nie przekazujemy danych do państw, wobec
                        których taka decyzja nie obowiązuje, w szczególności do Stanów Zjednoczonych.
                    </p>
                    <p>
                        Dane mogą zostać udostępnione również podmiotom uprawnionym na podstawie
                        przepisów prawa, jeżeli zwrócą się z takim żądaniem.
                    </p>
                </Section>

                <Section title="5. Pliki cookies i dane zapisywane w przeglądarce">
                    <p>
                        <span className="text-bone">Ta strona nie używa plików cookies.</span> Nie
                        korzystamy z narzędzi analitycznych, nie osadzamy treści z serwisów trzecich
                        i nie wysyłamy żadnych zapytań poza naszą infrastrukturę. Kroje pisma są
                        hostowane razem ze stroną, a nie pobierane z zewnętrznych serwerów.
                    </p>
                    <p>
                        Jedyne, co zapisujemy w Twojej przeglądarce, to informacja o zamknięciu
                        komunikatu o prywatności - po to, żeby nie pokazywać go przy każdej wizycie.
                        Zapis następuje w pamięci lokalnej przeglądarki, nie jest plikiem cookie, nie
                        pozwala Cię zidentyfikować i możesz go w każdej chwili usunąć, czyszcząc dane
                        witryny w ustawieniach przeglądarki.
                    </p>
                    <p>
                        Jeżeli w przyszłości dodamy narzędzia wymagające Twojej zgody, poprosimy
                        o nią osobno, zanim cokolwiek zostanie uruchomione.
                    </p>
                </Section>

                <Section title="6. Twoje prawa">
                    <p>W związku z przetwarzaniem danych przysługuje Ci prawo do:</p>
                    <ul className="ml-5 list-disc space-y-1">
                        <li>dostępu do swoich danych oraz otrzymania ich kopii,</li>
                        <li>sprostowania danych nieprawidłowych lub uzupełnienia niekompletnych,</li>
                        <li>usunięcia danych,</li>
                        <li>ograniczenia przetwarzania,</li>
                        <li>przenoszenia danych do innego administratora,</li>
                        <li>
                            wniesienia sprzeciwu wobec przetwarzania opartego na naszym prawnie
                            uzasadnionym interesie - w tym wobec kontaktu handlowego.
                        </li>
                    </ul>
                    <p>
                        Aby skorzystać z któregokolwiek z tych praw, napisz na{" "}
                        <a
                            href="mailto:support@vallus.eu"
                            className="text-bone underline decoration-line underline-offset-4 hover:decoration-accent"
                        >
                            support@vallus.eu
                        </a>
                        . Odpowiadamy bez zbędnej zwłoki, najpóźniej w ciągu miesiąca.
                    </p>
                    <p>
                        Masz również prawo wnieść skargę do organu nadzorczego - w Polsce jest nim
                        Prezes Urzędu Ochrony Danych Osobowych, ul. Stawki 2, 00-193 Warszawa.
                    </p>
                </Section>

                <Section title="7. Zautomatyzowane decyzje i profilowanie">
                    <p>
                        Nie podejmujemy wobec Ciebie decyzji w sposób zautomatyzowany i nie
                        profilujemy Cię. Terminy spotkań, które widzisz w formularzu, wynikają
                        wyłącznie z tego, co jest wolne w naszym kalendarzu - nie zależą od tego, kim
                        jesteś ani skąd pochodzisz.
                    </p>
                </Section>

                <Section title="8. Zmiany polityki">
                    <p>
                        Jeżeli zmienimy sposób przetwarzania danych, zaktualizujemy ten dokument
                        i zmienimy datę obowiązywania podaną na górze. W przypadku istotnych zmian
                        poinformujemy o nich osoby, z którymi pozostajemy w kontakcie.
                    </p>
                </Section>
        </LegalPage>
    );
}
