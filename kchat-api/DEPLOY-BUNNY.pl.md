# Wdrożenie kchat-api na Bunny Edge Scripting

Usługa działa jako skrypt na brzegu sieci bunny.net — tak samo jak `booking-api`.
Przekazuje wiadomości z formularza kontaktowego na kanał **Infomaniak kChat**. Sekret
(URL webhooka albo token bota) siedzi wyłącznie w konfiguracji skryptu Bunny, nigdy
w repozytorium ani w przeglądarce.

Koszt jak przy booking-api: **$0,2 / mln żądań + $0,02 / 1000 s CPU, min. $1/mies.**

---

## 1. Webhook w kChat

1. W kChat: **menu produktu → Integrations → Incoming Webhooks → Add**.
2. Wybierz kanał docelowy, skopiuj URL — wygląda tak:
   `https://<org>.kchat.infomaniak.com/hooks/<id>`.
3. Traktuj go jak hasło do kanału — kto go ma, może pisać na kanał.

(Alternatywa: token bota — wtedy zamiast webhooka ustawiasz `KCHAT_API_BASE`,
`KCHAT_TOKEN`, `KCHAT_CHANNEL_ID`. Webhook jest prostszy i domyślny.)

## 2. Sprawdzenie lokalnie

```bash
cd kchat-api
cp .env.example .env          # wklej URL do KCHAT_WEBHOOK_URL
npm install && npm run build
npm run probe                 # wysyła JEDNĄ testową wiadomość — sprawdź kanał
npm test                      # 19 testów: challenge + walidacja handlera
```

## 3. Utworzenie skryptu w bunny.net

1. Panel bunny.net → **Edge Platform → Scripting → Add Script**.
2. Typ: **Standalone script** (własny adres `*.bunny.run`).
3. Zapisz **Script ID** — potrzebny do wdrożenia.

### Zmienne i sekrety

Panel skryptu → **Env Configuration**. Rozróżnienie jest istotne:

- **Environment secrets** — szyfrowane, nieodczytywalne po zapisaniu. Tu wchodzą
  `KCHAT_WEBHOOK_URL` (albo `KCHAT_TOKEN`) i `KCHAT_CHALLENGE_SECRET`.
- **Environment variables** — zwykłe, odczytywalne. Cała reszta.

| Nazwa | Rodzaj | Wartość |
|---|---|---|
| `KCHAT_WEBHOOK_URL` | **secret** | URL webhooka z kroku 1 |
| `KCHAT_CHALLENGE_SECRET` | **secret** | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `ALLOWED_ORIGINS` | variable | `https://vallus.eu` — dokładne adresy po przecinku, bez wildcardów |
| `KCHAT_USERNAME` | variable | `vallus site` (opcjonalnie) |
| `KCHAT_ICON_EMOJI` | variable | `:envelope:` (opcjonalnie) |
| `KCHAT_MESSAGE_PREFIX` | variable | np. `New message from the vallus website` |
| `KCHAT_RATE_LIMIT_PER_HOUR` | variable | `5` (opcjonalnie) |
| `KCHAT_CHALLENGE_DIFFICULTY` | variable | `15` (opcjonalnie) |

**`KCHAT_CHALLENGE_SECRET` włącza proof-of-work.** Bez niego formularz nadal ma
honeypot i limit żądań, ale challenge jest wyłączony — ustaw go w produkcji.

**`PORT` zostaw nieustawiony.** Skrypt sprawdza tę zmienną, żeby odróżnić
uruchomienie lokalne od edge'a — ustawiona wymusza tryb lokalny.

## 4. Wdrożenie

```bash
cd kchat-api
npm run deploy        # build:edge + npx @bunny.net/cli scripts deploy dist/bundle.js
```

CLI zapyta o **Script ID** i **klucz API** konta bunny.net (Account Settings → API).
Po wdrożeniu wypisze adres `*.bunny.run`.

Sprawdź, zanim podepniesz stronę:

```bash
curl https://<twoj-skrypt>.bunny.run/health     # {"ok":true,"transport":"webhook"}
curl https://<twoj-skrypt>.bunny.run/config     # limit + challenge (jeśli sekret ustawiony)
curl -H "Origin: https://evil.example" -i https://<twoj-skrypt>.bunny.run/config \
  | grep -i access-control                       # musi nie zwrócić NIC
```

### Własna domena (opcjonalnie)

Jak przy booking-api: podepnij np. `kchat.vallus.eu` w ustawieniach domen skryptu.

## 5. Podpięcie strony

W repozytorium strony: **Settings → Secrets and variables → Actions → Variables**:

```
KCHAT_API_ORIGIN = https://kchat.vallus.eu      (albo adres *.bunny.run)
```

Workflow `bunny-sites.yml` przekaże to jako `NEXT_PUBLIC_KCHAT_API` do builda. To
wartość publiczna i tak ma być. Bez niej formularz kontaktowy degraduje się do
`mailto`. Sekret webhooka **nigdy** nie trafia do repozytorium ani GitHuba.

> Uwaga: komponent `src/components/contactKchat.tsx` istnieje, ale **nie jest jeszcze
> osadzony** na żadnej stronie — najpierw zamontuj `<ContactKchat />` (np. na `/contact`
> lub stronie głównej), żeby formularz był widoczny po deployu.

## Same-origin proxy (opcjonalnie, ale zalecane)

Żeby strona nie wołała `*.bunny.run` bezpośrednio (widoczne w Network + preflight
CORS), ruch idzie przez własną domenę: **`vallus.eu/api/kchat/*` → skrypt relay**.

Jak to jest skonfigurowane:

1. **Skrypt** przyjmuje prefiks: zmienna `KCHAT_BASE_PATH=/api/kchat`. Handler tnie
   ścieżkę od tego markera (router strony przepisuje ją najpierw na
   `/deploys/<hash>/api/kchat/...`, więc cięcie jest po markerze, nie od początku).
2. **Edge Rule** na pull-zone strony (`6260358`): trigger URL `*/api/kchat/*`,
   akcja **Origin URL** = `https://vallus-kchat-relay-z2f0i.bunny.run`. Dodane
   przez API:
   ```
   bunny api POST /pullzone/6260358/edgerules/addOrUpdate -b '{"Guid":null,
     "ActionType":2,"ActionParameter1":"https://vallus-kchat-relay-z2f0i.bunny.run",
     "Triggers":[{"Type":0,"PatternMatches":["*/api/kchat/*"],
     "PatternMatchingType":0,"Parameter1":""}],"TriggerMatchingType":0,
     "Description":"Proxy /api/kchat/* to the kChat relay (same-origin)",
     "Enabled":true}'
   ```
   Reguła jest odwracalna — usunięcie przywraca stan sprzed (reszta ruchu strony
   jej nie dotyczy, bo pattern jest wąski).
3. **Strona**: `NEXT_PUBLIC_KCHAT_API` / `NEXT_PUBLIC_LICENSE_API` = `/api/kchat`
   (ścieżka względna, same-origin). Bez preflightu CORS; w Network widać tylko
   `vallus.eu/api/kchat/...`.

Origin-gate (403 dla POST spoza `vallus.eu`) działa też za proxy — przeglądarka
przy same-origin POST wysyła `Origin: https://vallus.eu`, a Bunny forwarduje ten
nagłówek do skryptu.

## Aktualizacja później

```bash
cd kchat-api
npm test
npm run deploy
```
