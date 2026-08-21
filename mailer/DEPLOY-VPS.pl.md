# Wdrożenie mailera na VPS-ie Infomaniak

Mailer to jedyny element całości, który otwiera gniazdo SMTP — i dlatego jako jedyny
potrzebuje prawdziwego serwera. Edge (`kchat-api`) woła go po HTTP, on wysyła kod
przez SMTP Infomaniaka jako `sales@vallus.eu`.

```
edge (kchat-api)  ──POST /send-code──►  VPS: Caddy → mailer  ──SMTP :587──►  Infomaniak
   podpisuje HMAC              TLS         sprawdza podpis          sales@vallus.eu
```

Dwa kontenery, bez orkiestratora: `compose.yaml` uruchamia mailera i Caddy'ego, który
kończy TLS i publikuje **dokładnie jedną trasę** — `POST /send-code`. Reszta, łącznie
z `/health`, zwraca z proxy 404. Wariant kubernetesowy leży w `k8s/` i ma sens tylko
wtedy, gdy klaster i tak już płacisz z innego powodu.

## Czy VPS Lite wystarczy

Tak, najmniejszy wariant (1 vCPU / 2 GB RAM / 20 GB, 5,40 CHF/mies.). Zmierzone na
tym obrazie:

| | |
|---|---|
| Obraz mailera | 195 MB |
| Obraz `caddy:2-alpine` | 85 MB |
| RAM mailera w spoczynku | 17,3 MiB |
| CPU w spoczynku | 0,15% |

Usługa jest bezstanowa i wywoływana kilka razy dziennie. Brak SLA i snapshotów w Lite
nie boli, bo jedyny stan na dysku to certyfikat, który Caddy odtworzy sam.

Serwer już istnieje: **`179.237.100.147`** (`ov-2295dc.infomaniak.ch`).

---

## 1. Serwer: firewall i Docker

**Porty 80 i 443 były zamknięte** — sprawdzone z zewnątrz. Bez nich ACME nie przejdzie
i Caddy nie dostanie certyfikatu, a objawia się to jako usługa, która „się nie stawia",
choć kontenery chodzą.

W panelu Infomaniaka: **VPS → vallus-mailer → Firewall → Add a rule**. Wybierz
**Manual selection** (domyślne *All ports* otworzyłoby wszystko), typ `TCP`, porty
`80,443`, źródło *All*. Reguła jest już założona — opisana jako
„HTTP/HTTPS - Caddy (mailer.vallus.eu, ACME)". SSH było otwarte od początku.

Formularz jest dłuższy niż okno, a strona nie przewija się kółkiem — `Tab` z pola
opisu przenosi do przycisku **CONFIRM** i przewija do niego.
Potem, na serwerze. **Loguj się jako `ubuntu`** — obraz Infomaniaka odrzuca `root`
komunikatem „Please login as the user ubuntu"; `sudo` działa bez hasła.

```bash
ssh ubuntu@179.237.100.147
curl -fsSL https://get.docker.com | sudo sh   # Docker + wtyczka compose
nc -zv mail.infomaniak.com 587                # musi się połączyć
```

Ten `nc` to jedyny sposób, żeby wcześnie złapać najgorszy przypadek: **port 25 jest
u Infomaniaka zablokowany wychodząco**, 587 i 465 nie. Gdyby 587 milczał, mailer
zawiesiłby się dopiero przy pierwszej wysyłce, bez czytelnego błędu.

## 2. DNS

Zrobione — `mailer.vallus.eu` wskazuje na ten adres (rekord `A` w INWX). Jeśli
kiedykolwiek zmienisz serwer, podmień to **przed** restartem, bo Caddy prosi o
certyfikat przy starcie. Szczegóły strefy: [`../ustawienia.md`](../ustawienia.md).

## 3. Wgranie plików

`.dockerignore` wycina z **kontekstu builda** m.in. `compose.yaml` i `Caddyfile` — ale
na serwerze one są potrzebne, bo to nimi uruchamiasz całość. Kopiuj więc katalog, a nie
kontekst:

```bash
ssh ubuntu@179.237.100.147 'sudo mkdir -p /opt/vallus-mailer && sudo chown ubuntu:ubuntu /opt/vallus-mailer'
rsync -a --delete --exclude node_modules --exclude dist --exclude .git --exclude .env \
      mailer/ ubuntu@179.237.100.147:/opt/vallus-mailer/
```

`--exclude .env` jest tu celowo: `--delete` w parze z brakiem tego wykluczenia
skasowałby plik na serwerze przy każdej aktualizacji.

`.env` **nie jest w repozytorium** (i dobrze — trzyma hasło skrzynki i sekret HMAC),
więc jedzie osobno:

```bash
scp mailer/.env ubuntu@179.237.100.147:/opt/vallus-mailer/.env
ssh ubuntu@179.237.100.147 'chmod 600 /opt/vallus-mailer/.env'
```

Sprawdź w nim dwie wartości, które lokalnie mogą być inne niż produkcyjne:

| Zmienna | Na serwerze |
|---|---|
| `MAILER_DOMAIN` | `mailer.vallus.eu` — pod ten host Caddy bierze certyfikat |
| `ACME_EMAIL` | Twój adres; Let's Encrypt użyje go tylko do ostrzeżeń o wygasaniu |

`BIND_HOST` możesz zostawić — `compose.yaml` i tak nadpisuje go na `0.0.0.0`,
bo w kontenerze granicą jest sieć compose'a, nie interfejs.

## 4. Uruchomienie

```bash
cd /opt/vallus-mailer
sudo docker compose up -d --build
sudo docker compose ps            # mailer musi być "healthy"
```

Build na 1 vCPU trwa minutę–dwie (`npm ci` plus `tsc`).

Weryfikacja — trzy rzeczy, w tej kolejności:

```bash
# 1. certyfikat i to, że publikowana jest jedna trasa
curl -i https://mailer.vallus.eu/health          # oczekiwane 404 z Caddy'ego
curl -i https://mailer.vallus.eu/send-code       # 401 bad_signature (bez podpisu)

# 2. sam kontener żyje (od środka, bo /health nie wychodzi na świat)
sudo docker compose exec mailer wget -qO- http://127.0.0.1:8790/health   # {"ok":true}

# 3. prawdziwa wysyłka
sudo docker compose exec -T mailer node dist/probe.js twoj@adres.pl
```

**404 na `/health` z zewnątrz to poprawny wynik**, nie awaria — ten endpoint istnieje
dla healthchecka kontenera, nie dla internetu. Jeśli `/send-code` odpowiada `401`,
znaczy że trasa działa i broni jej podpis.

## 5. Podpięcie edge'a

W panelu skryptu `kchat-api` (Bunny → Env Configuration):

| Nazwa | Rodzaj | Wartość |
|---|---|---|
| `KCHAT_MAILER_URL` | variable | `https://mailer.vallus.eu` |
| `KCHAT_MAILER_SECRET` | **secret** | co do bajtu to samo, co `MAILER_AUTH_SECRET` w `.env` |
| `KCHAT_OTP_SECRET` | **secret** | losowe 32 bajty |

Weryfikacja mailem włącza się dopiero, gdy **wszystkie trzy** są ustawione. Niezgodny
sekret objawia się jednolitym `401 bad_signature` — nie częściową awarią, więc jeśli
widzisz 401 na każdym żądaniu, sprawdzaj sekret, nie kod.

---

## Aktualizacja później

```bash
npm test                                    # lokalnie, przed wysyłką
rsync -a --delete --exclude node_modules --exclude dist --exclude .git --exclude .env \
      mailer/ ubuntu@179.237.100.147:/opt/vallus-mailer/
ssh ubuntu@179.237.100.147 'cd /opt/vallus-mailer && sudo docker compose up -d --build'
```

`restart: unless-stopped` w `compose.yaml` załatwia start po reboocie serwera — nie
trzeba jednostki systemd.

## Uwagi eksploatacyjne

- **Wolumen `caddy_data` trzyma certyfikaty.** Skasowany oznacza ponowne wydanie przy
  każdym starcie, a to prosta droga do limitu Let's Encrypt (5 certyfikatów na domenę
  tygodniowo). `docker compose down` go nie rusza; `down -v` owszem — tej flagi tu nie
  używaj.
- **Nie publikuj portu mailera.** W `compose.yaml` jest `expose`, nie `ports`,
  celowo: Docker wpisuje własne reguły iptables **przed** firewallem, więc
  opublikowany port bywa widoczny z internetu mimo skonfigurowanego ufw.
- **Limit wysyłek siedzi w pamięci procesu** (5 na adres odbiorcy na godzinę). Restart
  kontenera go zeruje. Przy jednej instancji to wystarcza; przy dwóch trzeba by
  wspólnego magazynu.
- **System plików kontenera jest tylko do odczytu** (`read_only: true`, zapis wyłącznie
  w tmpfs `/tmp`). Jeśli kiedyś dojdzie coś, co chce pisać na dysk, to tutaj się wywali.
- **Logi są ograniczone** do 3 × 10 MB na kontener. `docker compose logs -f mailer`
  pokazuje na bieżąco; błędy SMTP lądują w nich z detalami, a do wywołującego idzie
  ogólne `502` — celowo, żeby nie wyciekały szczegóły serwera pocztowego.
- **Rotacja sekretu HMAC:** ustaw nowy w `.env`, `docker compose up -d`, dopiero potem
  podmień `KCHAT_MAILER_SECRET` na edge'u. Odwrotna kolejność oznacza okno, w którym
  wysyłka kodów nie działa.
- **Zmiana hasła skrzynki** wymaga podmiany `SMTP_PASS` i restartu — mailer loguje się
  do SMTP przy każdym wysłaniu, więc stare hasło objawi się jako `502` na każdej próbie.
- **Kopia zapasowa sprowadza się do `.env`.** Reszta odtwarza się z repozytorium jedną
  komendą.

---

## Stan po wdrożeniu (18.08.2026)

Postawione i sprawdzone z zewnątrz:

| | |
|---|---|
| Katalog | `/opt/vallus-mailer` na `179.237.100.147` |
| Kontenery | `mailer` (healthy) + `caddy`, oba `unless-stopped` |
| Certyfikat | Let's Encrypt dla `mailer.vallus.eu`, ważny do 16.11.2026 |
| `https://…/health` | `404` — zgodnie z zamysłem, trasa nie jest publikowana |
| `https://…/send-code` | `401 bad_signature` bez podpisu HMAC |
| `http://…` | `308` na HTTPS |
| Zużycie | mailer 13 MiB RAM, Caddy 13,2 MiB, dysk 3,0/19 GB |
| Wysyłka | `probe` z kontenera dostarczył kod na Gmaila |

Zostało jedno: ustawić `KCHAT_MAILER_URL`, `KCHAT_MAILER_SECRET` i `KCHAT_OTP_SECRET`
w panelu skryptu `kchat-api` (punkt 5), żeby edge zaczął z tego korzystać.
