# Wdrożenie booking-api na Bunny Edge Scripting

Usługa działa jako skrypt na brzegu sieci bunny.net - bez serwera do utrzymania, bez Dockera,
bez certyfikatów do odnawiania. Ten sam dostawca co strona.

Kalendarz nadal jest w Infomaniaku; tam potrzebny jest wyłącznie **token API**. Hosting WWW
u Infomaniaka **nie jest potrzebny**.

Koszt: **$0,2 za milion żądań + $0,02 za 1000 sekund CPU, minimum $1/miesiąc**. Formularz demo
generuje kilkanaście żądań dziennie, więc w praktyce płacisz to minimum.

---

## 1. Token do kalendarza Infomaniak

1. <https://manager.infomaniak.com/v3/ng/accounts/token/list> → **Create a token**
2. Zakres **`workspace:calendar`**. Zakres `user_info` jest potrzebny **tylko** wtedy, gdy nie
   ustawisz `BOOKING_ORGANIZER_EMAIL` - wtedy usługa pobiera adres organizatora z profilu konta.
   Skoro go ustawiasz, profil nie jest odpytywany i węższy token wystarczy.
3. **Skopiuj token od razu** - pokazuje się jeden raz.

Traktuj go jak hasło do kalendarza.

## 2. Sprawdzenie lokalnie

```bash
cd booking-api
cp .env.example .env          # wklej token do INFOMANIAK_TOKEN
npm install && npm run build
npm run probe
```

`probe` **tylko czyta**, niczego nie tworzy. Wypisze kalendarze, ten wybrany, adres organizatora,
surowy JSON pierwszego wydarzenia i terminy, które byłyby oferowane.

**Trzy rzeczy do zweryfikowania:**

- **Identyfikator kalendarza** - wpisz `INFOMANIAK_CALENDAR_ID` z listy. Uwaga: w odpowiedzi API
  jest też `account_id` i **to nie jest** identyfikator kalendarza. Wpisanie go daje mylące
  `403 access_denied`, wyglądające na problem z tokenem. Usługa sprawdza to teraz sama i mówi
  wprost, jeśli identyfikator nie należy do konta.
- **Strefa czasowa** - godziny wypisane przez `probe` muszą zgadzać się z
  <https://ksuite.infomaniak.com/calendar>.
- **Wykrywanie zajętości** - wstaw wydarzenie w godzinach pracy, uruchom `probe` ponownie.
  Musi trafić do sekcji *parsed as busy*, a odpowiadający termin zniknąć z oferty.

Potem uruchom całość lokalnie (z katalogu strony): `npm run dev:all`.

## 3. Utworzenie skryptu w bunny.net

1. Panel bunny.net → **Edge Platform → Scripting → Add Script**
2. Typ: **Standalone script** (skrypt ma własny adres `*.bunny.run`, nie jest origin dla pull zone)
3. Zapisz **Script ID** - będzie potrzebny do wdrożenia.

### Zmienne i sekrety

Panel skryptu → **Env Configuration**. Rozróżnienie jest istotne:

- **Environment secrets** - szyfrowane, **nie da się ich odczytać po zapisaniu**. Tu wchodzi
  `INFOMANIAK_TOKEN`.
- **Environment variables** - zwykłe, odczytywalne. Cała reszta.

| Nazwa | Rodzaj | Wartość |
|---|---|---|
| `INFOMANIAK_TOKEN` | **secret** | token z kroku 1 |
| `INFOMANIAK_CALENDAR_ID` | variable | identyfikator z `probe` |
| `BOOKING_TIMEZONE` | variable | `Europe/Warsaw` |
| `ALLOWED_ORIGINS` | variable | `https://vallus.eu` - dokładne adresy po przecinku, bez wildcardów |
| `BOOKING_ORGANIZER_EMAIL` | variable | `sales@vallus.eu` |
| `BOOKING_ORGANIZER_NAME` | variable | `vallus` |

Reguły rezerwacji (`BOOKING_SLOT_TIMES`, `BOOKING_WORKDAYS`, `BOOKING_LEAD_HOURS`,
`BOOKING_HORIZON_DAYS`, `BOOKING_SLOT_MINUTES`, `BOOKING_TITLE_PREFIX`,
`BOOKING_RATE_LIMIT_PER_HOUR`) też ustawiasz tutaj, jeśli chcesz inne niż domyślne. Pełna lista
z wartościami domyślnymi: [`.env.example`](.env.example).

**`PORT` zostaw nieustawiony.** Skrypt sprawdza tę zmienną, żeby odróżnić uruchomienie lokalne od
edge'a - ustawiona wymusza tryb lokalny, w którym Bunny nie poda socketu.

## 4. Wdrożenie

```bash
cd booking-api
npm run deploy        # build + npx @bunny.net/cli scripts deploy dist/edge.js
```

CLI zapyta o **Script ID** i **klucz API** konta bunny.net (Account Settings → API). Po wdrożeniu
wypisze adres `*.bunny.run`.

Sprawdź, zanim podepniesz stronę:

```bash
curl https://<twoj-skrypt>.bunny.run/health     # {"ok":true}
curl https://<twoj-skrypt>.bunny.run/slots      # prawdziwe terminy
curl -H "Origin: https://evil.example" -i https://<twoj-skrypt>.bunny.run/slots \
  | grep -i access-control                      # musi nie zwrócić NIC
```

### Własna domena (opcjonalnie)

Adres `*.bunny.run` działa, ale `api.vallus.eu` czyta się lepiej i uniezależnia od nazwy skryptu.
Podpina się to w panelu skryptu, w ustawieniach domen. Certyfikat Let's Encrypt jest w cenie.

## 5. Podpięcie strony

W repozytorium strony: **Settings → Secrets and variables → Actions → Variables**:

```
BOOKING_API_ORIGIN = https://api.vallus.eu      (albo adres *.bunny.run)
```

Workflow `bunny.yml` przekaże to jako `NEXT_PUBLIC_BOOKING_API` do builda. To wartość publiczna
i tak ma być. **Token nigdy nie trafia do repozytorium ani do GitHuba** - siedzi wyłącznie
w sekretach skryptu Bunny.

Po wdrożeniu w sekcji demo powinno być **„Live availability from our calendar"** zamiast
„Example availability". Jeśli widzisz przykładowy tekst, strona nie dobiła się do API - prawie
zawsze CORS albo adres.

---

## Aktualizacja później

```bash
cd booking-api
npm test              # 17 testów: sloty, zmiana czasu, zajętość
npm run deploy
```

Zmiana samych reguł rezerwacji nie wymaga wdrożenia - edytujesz zmienne w panelu skryptu. Strony
też nie trzeba przebudowywać, bo czyta reguły z `/slots` przy każdym wejściu.

## Uwagi eksploatacyjne

- **Limit żądań jest orientacyjny.** Licznik 5 rezerwacji na godzinę z IP siedzi w pamięci
  instancji, a na edge'u instancji jest wiele i są ulotne - rozproszony bot obejdzie go łatwiej niż
  na jednym serwerze. Realną ochroną są honeypot i to, że rezerwować można **wyłącznie termin
  z listy zwróconej przez `/slots`**. Jeśli spam stanie się problemem, następnym krokiem jest
  ochrona po stronie Bunny albo captcha.
- **Strona degraduje się bezpiecznie** - gdy skrypt nie odpowiada, sekcja demo wraca do
  przykładowego kalendarza i wysyłki mailem. Odwiedzający nie zobaczy błędu, ale **Ty też nie**,
  więc warto od czasu do czasu sprawdzić `/health`.
- **Podwójne rezerwacje są blokowane po stronie serwera** - `POST /book` sprawdza dostępność
  ponownie tuż przed utworzeniem wydarzenia i zwraca `409`.
- **Dni wolne** to zwykłe wydarzenia w kalendarzu Infomaniaka - nie ma osobnego ustawienia.
- **Organizatora ustala Infomaniak**, nie my. Sprawdzone: wysyłamy uczestnika z flagą
  `organizer: true`, a API zapisuje go jako zwykłego uczestnika i wstawia właściciela kalendarza.
  `BOOKING_ORGANIZER_EMAIL` decyduje o tym, **kogo dopisujemy**, a nie o adresie nadawcy
  zaproszenia.
- **Rotacja tokena:** wygeneruj nowy, podmień sekret w panelu skryptu, wdróż ponownie, dopiero
  potem skasuj stary w Managerze Infomaniaka.
- **Kasowanie wydarzeń** (`npm run cancel`) działa lokalnie i opiera się na endpoincie `DELETE`,
  którego Infomaniak nie dokumentuje. Zweryfikowany ręcznie, może zmienić się bez zapowiedzi.
