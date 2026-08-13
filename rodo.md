# RODO — co jeszcze zostało do domknięcia

Lista rzeczy potrzebnych, żeby przetwarzanie danych osobowych na stronie vallus i wokół niej
było uporządkowane. Stan na dziś, z zaznaczeniem co jest gotowe, co czeka na Twoje dane i co
jest decyzją, a nie zadaniem technicznym.

> **Nie jestem prawnikiem.** To zestawienie oparte na tym, co system faktycznie robi —
> zweryfikowane w kodzie i w przeglądarce. Podstawy prawne i treść polityki powinien przejrzeć
> prawnik przed publikacją.

---

## 1. Polityka prywatności — komplet

### Dane administratora — **uzupełnione**

W polityce wpisane jest:

> Piotr Gajownik — ExpandIt, ul. Paryska 20B, 44-240 Żory, Polska, NIP 5321875710
> (VAT UE: PL5321875710)

REGON pominięty — jest opcjonalny. Jeśli chcesz go dodać, podaj numer.

Art. 13 ust. 1 lit. a RODO wymaga wskazania tożsamości administratora, a przy JDG tożsamością
jest imię i nazwisko — dlatego nazwisko musi tu być, mimo że w treściach marketingowych zostało
usunięte.

**To ta sama kolizja, o której pisałem przy licencjach i przy pliku `web/LICENSE`.** Ukrywanie
skali działa w treściach marketingowych — w dokumentach prawnych nie. Warto to przyjąć świadomie
i pilnować tylko tego, żeby nazwisko nie wracało tam, gdzie nie musi: w podpisie e-mail, w panelu
pomocy produktu, w adresach skrzynek.

### Data obowiązywania — **ustawiona na 2 sierpnia 2026 r.**

Jeśli publikacja nastąpi później, powiedz — zmienię na właściwą.

### Retencja — **zdecydowane i wpisane: 6 miesięcy**

Już wpisane do polityki:

| Cel | Okres |
|---|---|
| Zgłoszenie demo, odpowiedź na zapytanie | 6 miesięcy od ostatniego kontaktu |
| Kontakt handlowy (uzasadniony interes) | do sprzeciwu, maks. 6 miesięcy od ostatniego kontaktu |
| Umowa i rozliczenia | okres wymagany przepisami podatkowymi (co do zasady 5 lat) |
| Obrona przed roszczeniami | do przedawnienia |

**Retencja jest teraz wykonalna jednym poleceniem.** Dane zgłaszających się osób nie leżą
w żadnej bazie, tylko **w wydarzeniach w Twoim kalendarzu Infomaniak** — tytuł zawiera nazwę
firmy, a opis imię, e-mail, telefon i treść wiadomości. Nic tam nie wygasa samo, więc:

```bash
cd booking-api
npm run cancel -- --older-than 6m         # pokazuje listę i pyta o potwierdzenie
npm run cancel -- --older-than 6m --yes   # bez pytania, do zadania cyklicznego
```

Polecenie rusza **wyłącznie** wydarzenia, których tytuł zaczyna się od `BOOKING_TITLE_PREFIX`
(domyślnie „vallus demo"). Wszystko inne w kalendarzu zostaje nietknięte i jest raportowane jako
pominięte — sprawdzone na żywym kalendarzu: wydarzenie „Wizyta u dentysty" z tego samego okresu
przetrwało.

**Jest też wpięte w harmonogram** i nie wymaga od Ciebie pamiętania. `.github/workflows/retention.yml`
uruchamia przebieg **1. dnia każdego miesiąca**, wołając endpoint `POST /retention` na wdrożonym
skrypcie. Można go też odpalić ręcznie z zakładki Actions, domyślnie w trybie podglądu.

**Token do kalendarza nie trafia przy tym do GitHuba.** Endpoint jest chroniony osobnym sekretem
`BOOKING_ADMIN_TOKEN`, więc gdyby ten wyciekł, jedyne co można zrobić, to wywołać usunięcie
rezerwacji, które i tak są już przeterminowane. Bez sekretu endpoint zwraca 401, a bez zmiennej
`BOOKING_ADMIN_TOKEN` po stronie skryptu w ogóle nie istnieje (404).

Żeby harmonogram ruszył, dodaj w repozytorium strony **sekret** `BOOKING_ADMIN_TOKEN` o wartości
z pliku `booking-api/.env` (linia `BOOKING_ADMIN_TOKEN=`). Wartość jest już ustawiona po stronie
Bunny.

---

## 2. Umowy powierzenia — **podpisane**

Dane prospektów przechodzą przez dwóch dostawców. Każdy jest **podmiotem przetwarzającym**
w rozumieniu art. 28 RODO.

| Podmiot | Co przetwarza | Status |
|---|---|---|
| **Infomaniak Network SA** (Szwajcaria) | kalendarz z wydarzeniami demo, poczta | podpisana |
| **BunnyWay d.o.o.** (Słowenia, UE) | hosting strony i usługi rezerwacji | podpisana |

### Czy trzeba je gdzieś załączać? Nie.

Umowa powierzenia to kontrakt między Tobą a dostawcą — nie publikuje się jej i nie dołącza do
polityki prywatności. Wystarczy, że w polityce jest napisane, że przetwarzanie odbywa się „na
podstawie umów powierzenia zawartych zgodnie z art. 28 RODO" — i **od teraz to zdanie jest
prawdziwe**, co wcześniej było lekko na wyrost.

Liczy się natomiast **rozliczalność** (art. 5 ust. 2 RODO): w razie kontroli trzeba umieć te
umowy okazać. Praktycznie oznacza to tyle:

- zachowaj podpisane egzemplarze (PDF) w miejscu, które przetrwa zmianę laptopa,
- zanotuj datę podpisania i wersję dokumentu — wystarczy jedna linijka na dostawcę,
- przy odnowieniu albo zmianie warunków przez dostawcę pobierz nową wersję.

> **Nie wrzucaj ich do tego repozytorium.** `PGExpandIt/ExpandIt` jest **publiczne** —
> sprawdzone. Wszystko, co tam trafi, widzi każdy i zostaje w historii gita nawet po usunięciu
> pliku. Naturalne miejsce to kDrive w Twoim kSuite: ten sam dostawca, szwajcarskie serwery,
> poza repozytorium.

Transfery są bezpieczne bez dodatkowych formalności: Słowenia to UE, a **Szwajcaria ma decyzję
o adekwatności** (art. 45 RODO), więc standardowe klauzule umowne nie są potrzebne. Infomaniak
trzyma dane wyłącznie w Szwajcarii i nie korzysta z amerykańskich podwykonawców — to argument,
który warto podnosić przy sprzedaży do sektora publicznego, nie tylko formalność.

---

## 3. Rejestr czynności przetwarzania

Art. 30 ust. 5 RODO zwalnia podmioty poniżej 250 pracowników — **ale zwolnienie nie działa**,
gdy przetwarzanie nie ma charakteru sporadycznego. Zbieranie zgłoszeń przez formularz na stronie
i prowadzenie na tej podstawie sprzedaży jest regularne, więc w praktyce rejestr należy
prowadzić.

To nie jest system informatyczny — wystarczy tabela w arkuszu albo dokument, obejmująca:

- nazwę czynności (np. „obsługa zgłoszeń demo", „realizacja umów licencyjnych"),
- cel i podstawę prawną,
- kategorie osób i danych,
- odbiorców (Infomaniak, Bunny, biuro rachunkowe),
- planowane terminy usunięcia,
- ogólny opis zabezpieczeń.

**Szkielet jest przygotowany** — plik `rejestr-czynnosci-przetwarzania.md`, wypełniony pięcioma
czynnościami wynikającymi z tego, co system faktycznie robi: obsługa zgłoszeń demo, kontakt
handlowy, umowy i rozliczenia, wsparcie techniczne, realizacja praw osób. Do uzupełnienia zostały
pola `[…]` i pozycje `[POTWIERDŹ]` dotyczące Twojego stanowiska pracy.

**Nie umieściłem go w tym repozytorium** — jest publiczne, a rejestr opisuje odbiorców i przyjęte
zabezpieczenia. Trzymaj go razem z podpisanymi umowami powierzenia, poza repozytorium kodu.

---

## 4. Procedury, które warto mieć spisane

Krótkie, jednostronicowe. Nikt ich nie czyta do momentu, w którym są nagle potrzebne.

### Realizacja praw osób

Ktoś pisze „proszę o usunięcie moich danych". Potrzebujesz:

- **terminu:** odpowiedź bez zbędnej zwłoki, maksymalnie miesiąc od żądania,
- **miejsc do sprawdzenia:** kalendarz Infomaniak (wydarzenia demo), skrzynka `sales@` i
  `support@`, ewentualne notatki handlowe,
- **potwierdzenia** wykonania na piśmie.

### Naruszenie ochrony danych

Zgłoszenie do PUODO w ciągu **72 godzin** od stwierdzenia, jeśli naruszenie może powodować
ryzyko dla praw i wolności osób. Realistyczne scenariusze u Ciebie: wyciek tokena Infomaniaka
(daje dostęp do kalendarza z danymi prospektów), przejęcie skrzynki, zgubiony laptop
z plikiem `.env`.

**Wniosek praktyczny:** token w `booking-api/.env` i sekret w panelu Bunny to dane, których
wyciek jest zdarzeniem podlegającym zgłoszeniu. Warto trzymać dysk zaszyfrowany i rotować token,
jeśli pojawi się wątpliwość.

---

## 5. Kiedy dojdą kolejne obowiązki

Dziś strona nie ma cookies ani analityki — sprawdziłem to na zbudowanej wersji: zero plików
cookie, zero zapisów w pamięci przeglądarki poza informacją o zamknięciu banera, zero zapytań do
zewnętrznych hostów. Baner jest więc informacyjny, nie zgodowy, i to jest stan zgodny z prawdą.

To się zmieni, jeśli dodasz:

| Co | Co wtedy dochodzi |
|---|---|
| Analitykę (nawet „prywatną" jak Plausible czy Matomo) | przełącznik `HAS_NON_ESSENTIAL` w `cookieNotice.tsx` na `true`, realna zgoda przed załadowaniem skryptu, opis w polityce |
| Newsletter albo mailing handlowy | odrębna zgoda i możliwość jej wycofania — wymaga tego Prawo komunikacji elektronicznej, niezależnie od RODO |
| Osadzone wideo, mapę, czat | to samo co przy analityce — zgoda przed załadowaniem |
| Formularz kontaktowy z prawdziwą wysyłką (zamiast `mailto`) | opisanie nowego dostawcy w polityce i umowa powierzenia z nim |

---

## 6. Produkt vallus — inna rola, nie mieszać

Warto to rozgraniczyć, bo przy rozmowach z klientami korporacyjnymi pytanie padnie:

- **Strona vallus.eu** — tutaj Ty jesteś **administratorem** danych osób, które się zgłaszają.
- **Produkt vallus u klienta** — jest self-hosted. Dane testowe, konta użytkowników i wyniki
  zostają na infrastrukturze klienta, a Ty nie masz do nich dostępu. **Nie jesteś tam
  podmiotem przetwarzającym**, bo nic nie przetwarzasz.
- **Wyjątek:** wsparcie zdalne, przy którym zobaczyłbyś środowisko klienta z danymi osobowymi.
  Wtedy dopiero powstaje powierzenie i potrzebna jest umowa. Ten warunek jest już zapisany
  w draftach licencji (sekcja o ochronie danych).

To mocna pozycja negocjacyjna: większość konkurencji w modelu SaaS musi tłumaczyć, gdzie leżą
dane klienta. Ty możesz odpowiedzieć, że nigdzie u Ciebie.

---

## Podsumowanie — status

| | Pozycja | Stan |
|---|---|---|
| ✅ | Polityka prywatności — treść i struktura art. 13 | gotowa: `/privacy/` (EN, główna) i `/privacy/pl/` (PL) |
| ✅ | Link w stopce, w banerze i **przy formularzu** | gotowe |
| ✅ | Baner informacyjny o braku cookies | gotowy, przełączalny na zgodowy |
| ✅ | Retencja 6 miesięcy | wpisana do polityki |
| ✅ | Dane administratora | wpisane (Piotr Gajownik — ExpandIt, Żory, NIP 5321875710) |
| ✅ | Data obowiązywania | 2 sierpnia 2026 r. |
| ✅ | Umowa powierzenia z Infomaniakiem | podpisana |
| ✅ | Umowa powierzenia z Bunny | podpisana |
| ✅ | Rejestr czynności przetwarzania | szkielet gotowy, do uzupełnienia pól `[…]` |
| ✅ | Usuwanie wydarzeń po 6 miesiącach | `npm run cancel -- --older-than 6m`, przetestowane na żywym kalendarzu |
| ⏳ | Przegląd prawny całości | do zlecenia |
