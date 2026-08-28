# Ustawienia - co i gdzie trzeba skonfigurować

Wszystko, co trzeba ustawić **poza kodem**, żeby strona vallus.eu, kalendarz, kChat
i wysyłka maili z `sales@vallus.eu` działały. Kolejność jest celowa - DNS na końcu,
bo dopiero wtedy znasz adres IP serwera.

Skrót: pięć miejsc.

| Miejsce | Co tam ustawiasz |
|---|---|
| Infomaniak Manager | skrzynka `sales@vallus.eu`, token do kalendarza, webhook kChat |
| VPS (`mailer/.env`) | dane SMTP, sekret HMAC, domena dla Caddy |
| Bunny Edge Script (`kchat-api`) | webhook kChat, sekrety OTP, adres mailera |
| Bunny Edge Script (`booking-api`) | token Infomaniak, reguły rezerwacji |
| GitHub → Actions | `BUNNY_API_KEY`, `BOOKING_API_ORIGIN` |
| **INWX (DNS)** | `A mailer`, SPF, DKIM, DMARC - sekcja na dole |

---

## 1. Infomaniak

### Skrzynka `sales@vallus.eu`

Mailer loguje się do niej po SMTP - to jedyne miejsce w całym systemie, które
otwiera połączenie SMTP.

1. Manager → **Mail Service** → domena `vallus.eu` → utwórz adres `sales@vallus.eu`
   (albo użyj istniejącego).
2. Ustaw hasło i zapisz je - trafi do `mailer/.env` jako `SMTP_PASS`.
3. Sprawdź, że dla tej skrzynki **nie jest wymuszone 2FA na SMTP**. Jeśli jest,
   wygeneruj hasło aplikacyjne i użyj go zamiast zwykłego.

Parametry serwera - dane z Infomaniaka, już wpisane w `.env.example`:

| | |
|---|---|
| Serwer wychodzący (SMTP) | `mail.infomaniak.com` |
| Port SMTP | **`587` STARTTLS** → `SMTP_PORT=587`, `SMTP_SECURE=false` (zalecane przez Infomaniaka) |
| Login | pełny adres, czyli `sales@vallus.eu` |
| Hasło | hasło skrzynki → `SMTP_PASS` |

Alternatywa, jeśli 587 byłby gdzieś filtrowany: `SMTP_PORT=465` + `SMTP_SECURE=true`
(implicit TLS). Kod obsługuje oba - `SMTP_SECURE` decyduje, który tryb.
Na 587 wymuszamy STARTTLS (`requireTLS`), więc gdyby serwer go nie zaoferował,
wysyłka się nie uda, zamiast po cichu pójść otwartym tekstem razem z hasłem.

> Port **25 jest zablokowany wychodząco** na VPS-ach i Public Cloud Infomaniaka.
> 587 i 465 nie są - na VPS-ie otwórz wychodząco **587**.

**IMAP (`mail.infomaniak.com:993`, SSL/TLS) mailera nie dotyczy** - serwis tylko
wysyła, nigdy nie czyta poczty. Te dane przydają się do wpięcia skrzynki
`sales@vallus.eu` w klienta pocztowego (Thunderbird, Mail, Outlook).

### Token do kalendarza (booking-api)

Manager → [lista tokenów](https://manager.infomaniak.com/v3/ng/accounts/token/list) →
nowy token, zakres `workspace:calendar` (plus `user_info`, jeśli nie ustawisz
`BOOKING_ORGANIZER_EMAIL`). Pokazywany **raz** - traktuj jak hasło do kalendarza.

### Webhook kChat (kchat-api)

kChat → menu produktu → **Integracje → Incoming Webhooks → Dodaj** → wybierz kanał →
skopiuj URL postaci `https://<org>.kchat.infomaniak.com/hooks/xxxxxxxx`.
To jest `KCHAT_WEBHOOK_URL`. Nigdy nie trafia do przeglądarki.

---

## 2. Mailer na VPS-ie (`mailer/.env`)

Serwis stoi poza edge'em, bo Bunny Edge Scripting **odradza wysyłkę maili**
(uruchamia ochronę przed nadużyciami, ryzyko zawieszenia konta), a Infomaniak
**nie ma HTTP API do wysyłki** - tylko SMTP.

```bash
cp .env.example .env
```

Do uzupełnienia:

| Zmienna | Skąd wziąć |
|---|---|
| `SMTP_PASS` | hasło skrzynki `sales@vallus.eu` (punkt 1) |
| `MAILER_AUTH_SECRET` | wygeneruj: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `MAILER_DOMAIN` | `mailer.vallus.eu` - pod ten host Caddy weźmie certyfikat |
| `ACME_EMAIL` | Twój adres; Let's Encrypt użyje go tylko do ostrzeżeń o wygasaniu |
| `MAIL_SIGNATURE` | stopka pod treścią maila - patrz niżej; puste = bez stopki |

### Stopka (podpis) w mailu z kodem

Podpis ustawiony w webmailu Infomaniaka **nie trafia** na maile wysyłane po SMTP -
webmail dokleja go dopiero w momencie pisania wiadomości, a SMTP wysyła dokładnie
to, co dostanie od nadawcy. Infomaniak nie udostępnia też API, którym dałoby się tę
stopkę odczytać. Dlatego przepisuje się ją do `MAIL_SIGNATURE`:

```
MAIL_SIGNATURE=vallus\nsales@vallus.eu\nhttps://vallus.eu
```

`\n` zamienia się na złamanie linii. Efekt w wiadomości:

```
Your vallus verification code is 123456. It is valid for 10 minutes.

-- 
vallus
sales@vallus.eu
https://vallus.eu
```

Linia `-- ` (z myślnikami i spacją) to standardowy separator stopki: klienty
pocztowe zwijają to, co pod nim, i pomijają w cytowanych odpowiedziach.

Oryginał podpisu w HTML (ten z webmaila) leży w `mailer/signature.html`, razem z
logo w `mailer/signature-logo.svg` - na wypadek odbudowy skrzynki albo gdybyś
kiedyś chciał wersję HTML maila. Runtime go nie czyta.

Tylko tekst - mail z kodem jest celowo `text/plain`, bo taka poczta transakcyjna
rzadziej ląduje w spamie. Stopka z logo wymagałaby wersji HTML dla jednej linijki
brandingu. **To kopia**, więc zmiana podpisu w webmailu nie zmienia tej tutaj.

Reszta ma sensowne wartości domyślne. `SEND_RATE_LIMIT_PER_HOUR=5` to limit **na
adres odbiorcy** - nawet wyciek sekretu nie pozwoli zasypać czyjejś skrzynki.

**`MAILER_AUTH_SECRET` musi być identyczny z `KCHAT_MAILER_SECRET` po stronie
edge'a.** To jedyna bramka autoryzacji mailera - nie ma tu CORS-u ani przeglądarki,
liczy się wyłącznie podpis HMAC nagłówka `X-Signature`.

### Uruchomienie

Pełna procedura wdrożenia na VPS-ie (firewall, Docker, rsync, weryfikacja, aktualizacje):
[`mailer/DEPLOY-VPS.pl.md`](mailer/DEPLOY-VPS.pl.md). W skrócie:

```bash
docker compose up -d --build
docker compose exec mailer node dist/probe.js twoj@adres.pl   # jeden prawdziwy mail
```

Na serwerze muszą być otwarte: **80 i 443 przychodząco** (ACME + API) oraz
**587 wychodząco** (SMTP). Sam mailer nie jest publikowany na hoście - dociera do
niego tylko Caddy, po sieci wewnętrznej, i publikuje dokładnie jedną trasę:
`POST /send-code`. Wszystko inne, łącznie z `/health`, zwraca 404.

---

## 3. Edge: `kchat-api` (Bunny Edge Scripting)

Te same nazwy zmiennych co w `.env`, ale wpisane w ustawieniach skryptu Bunny -
wrażliwe jako **environment secret**, żeby nie dało się ich odczytać z powrotem.

| Zmienna | Wartość |
|---|---|
| `KCHAT_WEBHOOK_URL` | webhook z punktu 1 (**secret**) |
| `ALLOWED_ORIGINS` | `https://vallus.eu,https://www.vallus.eu` - dokładne originy, bez wildcardów, schemat ma znaczenie |
| `KCHAT_CHALLENGE_SECRET` | losowe 32 bajty (**secret**); puste = wyłączony proof-of-work |
| `KCHAT_OTP_SECRET` | losowe 32 bajty (**secret**) |
| `KCHAT_MAILER_URL` | `https://mailer.vallus.eu` |
| `KCHAT_MAILER_SECRET` | **to samo** co `MAILER_AUTH_SECRET` (**secret**) |
| `PORT` | **nie ustawiaj** na Bunny - po jego braku entry point poznaje tryb edge |

Weryfikacja mailem (OTP) włącza się **tylko wtedy, gdy wszystkie trzy** -
`KCHAT_OTP_SECRET`, `KCHAT_MAILER_URL`, `KCHAT_MAILER_SECRET` - są ustawione.
Brak którejkolwiek = OTP wyłączony, `/request-code` zwraca 404, a endpointy
wiadomości wracają do proof-of-work. Edge **nigdy** nie otwiera SMTP.

Deploy: `npm run deploy` (szczegóły w `booking-api/DEPLOY-BUNNY.pl.md`).

---

## 4. Edge: `booking-api`

`INFOMANIAK_TOKEN` (secret), `INFOMANIAK_CALENDAR_ID` (przypnij - inaczej nowy
kalendarz na koncie może przestawić rezerwacje pod niewłaściwy),
`ALLOWED_ORIGINS`, `BOOKING_TIMEZONE=Europe/Warsaw`. Reguły godzin i slotów -
pełna tabela w `README.md`. Dni wolne to nie ustawienie: zablokuj czas w kalendarzu
Infomaniaka i te sloty przestają się pokazywać.

## 5. GitHub → Settings → Secrets and variables → Actions

| | |
|---|---|
| Secret `BUNNY_API_KEY` | klucz API konta bunny.net - jedyny sekret potrzebny do deployu strony |
| Variable `BOOKING_API_ORIGIN` | `https://vallus-api-calendar-p498a.bunny.run`; **nieustawiony = sekcja demo po cichu przechodzi na mailto** i niczego nie rezerwuje |
| Variable `LICENSE_API_ORIGIN` | `/api/kchat` - ta sama domena, przez regułę edge pull zone. **Nieustawiony = `/free` po cichu przechodzi na mailto**, mimo że formularz ma pełną obsługę kodu |
| Variable `KCHAT_API_ORIGIN` | `/api/kchat` dla formularza kontaktowego. **Wymagany** - bez niego kontakt po cichu przechodzi na mailto. Deploy z GH Actions przerywa się, gdy zmiennej brakuje |

Token Infomaniaka **nigdy nie trafia do GitHuba** - booking-api nie jest wdrażany
przez Actions, więc GitHub nie ma powodu trzymać poświadczeń do Twojego kalendarza.

---

# 6. INWX - ustawienia DNS

DNS domeny `vallus.eu` obsługuje INWX (serwery `ns.inwx.de`, `ns2.inwx.de`,
`ns3.inwx.eu`), więc **wszystkie rekordy dodajesz ręcznie w panelu INWX** -
automatyczna konfiguracja DNS z panelu Infomaniaka tutaj nie zadziała, bo
Infomaniak nie zarządza tą strefą.

Gdzie: [inwx.com](https://www.inwx.com) → zaloguj się → **Domeny** → `vallus.eu` →
zakładka **Nameserver / DNS** → *Nowy rekord*. Pole „Nazwa" (Host) zostawiasz puste
albo wpisujesz `@` dla samej domeny; wpisujesz tylko subdomenę, **bez** `.vallus.eu`
na końcu.

### Co już jest ustawione - nie ruszaj

| Typ | Nazwa | Wartość | Po co |
|---|---|---|---|
| `MX` | `@` | `5 mta-gw.infomaniak.ch.` | poczta przychodząca do Infomaniaka |
| `TXT` | `@` | `v=spf1 include:spf.infomaniak.ch -all` | SPF - autoryzuje serwery Infomaniaka do wysyłki w imieniu domeny; mailer wysyła przez nie, więc jest pokryty |
| `A` | `@` | `185.111.111.158` | strona (bunny.net) |
| `CNAME` | `www` | `sites-vallus-fazzji.b-cdn.net.` | strona (bunny.net) |
| `TXT` | `20260730._domainkey` | `v=DKIM1; t=s; p=MIIBIjANBg…` | DKIM - klucz publiczny, którym Infomaniak podpisuje wychodzącą pocztę |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:sales@vallus.eu; fo=1; adkim=r; aspf=r` | DMARC w trybie obserwacji |
| `A` | `mailer` | `179.237.100.147` | host mailera (VPS) |
| `CNAME` | `autoconfig` | `infomaniak.com.` | autokonfiguracja klienta pocztowego |
| `CNAME` | `autodiscover` | `infomaniak.com.` | jw., wariant Outlooka |

SPF ma `-all` (hard fail) i **`include:spf.infomaniak.ch` wystarczy** - mailer nie
wysyła bezpośrednio, tylko loguje się do SMTP Infomaniaka, więc na świat wychodzi
z ich adresów. Nie dodawaj tu IP VPS-a.

### Co trzeba dodać

Nic - strefa jest kompletna. Wszystkie pozycje, które panel Infomaniaka
(**Mail Service → vallus.eu → Domains management → DNS test**) sprawdza, są
opublikowane i zgodne.

Jedyne, co może się jeszcze zmienić: jeśli przeniesiesz mailera na inny serwer,
podmień IP w rekordzie `A mailer`. Gdyby VPS miał IPv6, dołóż `AAAA` o tej samej
nazwie.

### Czego w INWX **nie** ustawiasz

- **PTR / rDNS dla VPS-a** - to ustawienie u dostawcy serwera, nie w rejestrze
  domeny. I tak nie jest potrzebne: mailer nie jest serwerem wysyłającym, tylko
  klientem SMTP Infomaniaka.
- **Rekordu dla `booking-api` / `kchat-api`** - działają pod adresami
  `*.bunny.run`, nie pod Twoją domeną.
- **Zmiany nameserverów** - strefa ma zostać w INWX; przeniesienie do Infomaniaka
  zabrałoby ze sobą rekordy strony na bunny.net.

### Sprawdzenie po propagacji (kilka minut do godziny)

```bash
dig +short A    mailer.vallus.eu
dig +short TXT  vallus.eu                          # SPF
dig +short TXT  20260730._domainkey.vallus.eu      # DKIM
dig +short TXT  _dmarc.vallus.eu                   # DMARC
dig +short CNAME autoconfig.vallus.eu
```

Stan poczty potwierdza też sam Infomaniak: **Mail Service → vallus.eu → Domains
management → DNS test**. Pokazuje pięć pozycji i to, którą widzi jako `Valid`.

Test end-to-end - jeden prawdziwy mail i nagłówki:

```bash
docker compose exec mailer node dist/probe.js twoj@adres.pl
```

W odebranej wiadomości (Gmail → *Pokaż oryginał*) mają być trzy `pass`:
`spf=pass`, `dkim=pass`, `dmarc=pass`.

---

## Lista kontrolna

- [x] Skrzynka `sales@vallus.eu` istnieje, hasło działa (SMTP login OK)
- [x] `mailer/.env` uzupełniony, `npm run probe` dostarcza maila
- [x] `MAILER_AUTH_SECRET` == `KCHAT_MAILER_SECRET` (porównane po SHA-256)
- [x] Mailer działa na VPS-ie `179.237.100.147` (`/opt/vallus-mailer`), certyfikat Let's Encrypt do 16.11.2026
- [x] Zmienne edge'a w Bunny (`vallus kchat relay`, skrypt 85819): `KCHAT_MAILER_URL` jako variable,
      `KCHAT_MAILER_SECRET` / `KCHAT_OTP_SECRET` / `KCHAT_CHALLENGE_SECRET` / `KCHAT_WEBHOOK_URL` jako secret,
      `PORT` **nieustawiony**; `GET /api/kchat/config` zwraca `"otp":true`
- [ ] `BUNNY_API_KEY`, `BOOKING_API_ORIGIN` i `LICENSE_API_ORIGIN` w GitHub Actions
      (produkcja stoi na ręcznym deployu CLI z tymi wartościami - bez wpisu w repo
      pierwszy build z `main` cofnie `/free` do mailto)
- [x] INWX: DKIM (selektor `20260730`), DMARC, `A mailer`, `CNAME autoconfig` i `autodiscover`
- [x] Testowy mail przechodzi SPF + DKIM + DMARC (Gmail, 18.08.2026: `dkim=pass header.s=20260730`, `spf=pass`, `dmarc=pass`, Odebrane nie spam)
