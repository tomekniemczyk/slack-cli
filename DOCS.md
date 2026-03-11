# slackcli — Dokumentacja i User Manual

## Spis treści
1. [Opis projektu](#opis)
2. [Instalacja](#instalacja)
3. [Autentykacja](#autentykacja)
4. [User Manual — wszystkie komendy](#komendy)
5. [Przykłady użycia](#przykłady)
6. [Troubleshooting](#troubleshooting)
7. [Architektura techniczna](#architektura)

---

## Opis projektu {#opis}

`slackcli` to narzędzie wiersza poleceń (CLI) do wysyłania i czytania wiadomości Slack bezpośrednio z terminala. Działa jako **Ty** — wiadomości są wysyłane z Twojego konta, masz dostęp do wszystkich kanałów w których jesteś członkiem.

**Kluczowa zaleta:** nie wymaga zgody administratora workspace'u — autentykacja odbywa się przez token sesji z zainstalowanej aplikacji Slack desktop.

**Repozytorium:** https://github.com/tomek-niemczyk-vimn/slack-cli

---

## Instalacja {#instalacja}

### Wymagania
- Node.js 18+
- Zainstalowana i zalogowana aplikacja Slack desktop

### Kroki

```bash
git clone https://github.com/tomek-niemczyk-vimn/slack-cli.git
cd slack-cli
npm install
```

### Alias (jednorazowe ustawienie)

Alias `slackcli` jest już dodany do `~/.bashrc` i `~/.zshrc`.
Aby aktywować bez restartu terminala:

```bash
source ~/.bashrc
```

Alias wskazuje na:
```
alias slackcli='node /home/niemczyt/src/slack-integration/index.js'
```

---

## Autentykacja {#autentykacja}

### Metoda 1: Import tokena z Slack desktop (zalecana, bez admina)

```bash
slackcli import-desktop-token
```

Skrypt automatycznie:
1. Czyta token `xoxc-` z LevelDB Slacka (`~/.config/Slack/Local Storage/`)
2. Odszyfrowuje cookie `d` (sesji) używając klucza AES z systemowego keyringa
3. Zapisuje `SLACK_TOKEN` i `SLACK_COOKIE_D` do pliku `.env`

> ⚠️ Token wygasa gdy Slack odświeży sesję (zazwyczaj co kilka tygodni).  
> Przy błędzie `invalid_auth` uruchom ponownie `import-desktop-token`.

### Metoda 2: OAuth przez przeglądarkę

Wymaga jednorazowej konfiguracji Slack App:

1. https://api.slack.com/apps → **Create New App** → From scratch
2. **OAuth & Permissions** → **User Token Scopes** → dodaj:
   - `channels:history`, `channels:read`, `channels:write`
   - `chat:write`
   - `groups:history`, `groups:read`, `groups:write`
   - `im:history`, `im:read`, `im:write`
   - `mpim:history`, `mpim:read`, `mpim:write`
   - `search:read`, `users:read`
3. **OAuth & Permissions** → Redirect URLs → dodaj: `https://localhost:3000/callback`
4. **Basic Information** → skopiuj **Client ID** i **Client Secret**
5. Utwórz `.env`:
   ```
   SLACK_CLIENT_ID=twój-client-id
   SLACK_CLIENT_SECRET=twój-client-secret
   ```
6. Uruchom:
   ```bash
   slackcli login
   ```
   Przeglądarka się otworzy → kliknij **Allow** → token zapisze się automatycznie.
   
   > ⚠️ Przeglądarka pokaże ostrzeżenie o certyfikacie (self-signed na localhost).  
   > Kliknij „Zaawansowane" → „Przejdź dalej do localhost" — to bezpieczne.

### Plik .env

```env
# Wypełniane automatycznie przez import-desktop-token lub login:
SLACK_TOKEN=xoxc-...
SLACK_COOKIE_D=xoxd-...

# Wymagane tylko dla OAuth login:
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
```

> `.env` jest w `.gitignore` i nigdy nie zostanie commitowany.

---

## User Manual — wszystkie komendy {#komendy}

### `slackcli import-desktop-token`

Wyciąga token sesji z aplikacji Slack desktop i zapisuje do `.env`.

```bash
slackcli import-desktop-token
```

**Wymagania:** Slack desktop musi być uruchomiony i zalogowany.

**Co robi:**
- Przeszukuje `~/.config/Slack/Local Storage/leveldb/*.ldb` w poszukiwaniu tokenu `xoxc-`
- Odczytuje klucz szyfrowania AES z systemowego keyringa (`org.freedesktop.secrets`)
- Odszyfrowuje cookie `d` z `~/.config/Slack/Cookies`
- Zapisuje do `.env`

---

### `slackcli login`

Autentykacja przez przeglądarkę (OAuth 2.0). Wymaga skonfigurowanej Slack App z `SLACK_CLIENT_ID` i `SLACK_CLIENT_SECRET` w `.env`.

```bash
slackcli login
```

**Flow:**
1. Startuje lokalny HTTPS serwer na `https://localhost:3000`
2. Otwiera przeglądarkę z URL autoryzacji Slack
3. Po kliknięciu Allow — zapisuje token do `.env`

---

### `slackcli channels`

Lista Twoich kanałów pogrupowana według sekcji z Slack sidebar.

```bash
slackcli channels
```

**Format wyjścia:**
```
▸ Nazwa Sekcji
  # kanał-publiczny                      C04NPT74H  ●
  🔒 kanał-prywatny                       G012TJFCHL2
  💬 dm-z-uzytkownikiem                   D01PQUZUY0M  🔔2
```

**Legenda:**
- `#` — kanał publiczny
- `🔒` — kanał prywatny
- `💬` — wiadomość bezpośrednia (DM)
- `●` (niebieski) — nieprzeczytane wiadomości
- `🔔N` — N wzmianek (@ty)

---

### `slackcli read <channel>`

Czyta ostatnie wiadomości z kanału.

```bash
slackcli read <channel> [--limit <n>]
```

**Argumenty:**
- `<channel>` — nazwa kanału (np. `general`, `#general`) lub ID (np. `C04NPT74H`)

**Opcje:**
- `-l, --limit <n>` — liczba wiadomości do pobrania (domyślnie: `10`)

**Przykłady:**
```bash
slackcli read general
slackcli read general --limit 50
slackcli read C04NPT74H -l 5
```

**Format wyjścia:**
```
📨 Last 10 messages from #general:

[11.03.2026, 15:00:00] user.name
  Treść wiadomości...
```

---

### `slackcli send <channel> <message>`

Wysyła wiadomość na kanał jako Ty.

```bash
slackcli send <channel> "<message>"
```

**Argumenty:**
- `<channel>` — nazwa lub ID kanału
- `<message>` — treść wiadomości (użyj cudzysłowów dla wiadomości z spacjami)

**Przykłady:**
```bash
slackcli send general "Hej wszystkim!"
slackcli send heheszki "Dobry wieczór 🎉"
slackcli send C04NPT74H "Wiadomość na kanał po ID"
```

---

### `slackcli mentions`

Wyświetla wiadomości w których jesteś oznaczony (`@twoja-nazwa`).

```bash
slackcli mentions [--limit <n>]
```

**Opcje:**
- `-l, --limit <n>` — liczba wzmianek do pobrania (domyślnie: `20`)

**Format wyjścia:**
```
🔔 Twoje wzmianki (5):

[11.03.2026, 14:00:00] #general — jan.kowalski
  Hej @ty, możesz to sprawdzić?
  🔗 https://paramount.slack.com/archives/C04NPT74H/p17...
```

---

### `slackcli mark-read`

Oznacza wszystkie kanały, DM i grupy jako przeczytane.

```bash
slackcli mark-read
```

**Przykład wyjścia:**
```
⏳ Oznaczam wszystko jako przeczytane...
✅ Oznaczono 42/99 kanałów jako przeczytane.
```

---

## Przykłady użycia {#przykłady}

### Poranny przegląd

```bash
# Sprawdź kanały z nieprzeczytanymi
slackcli channels

# Przeczytaj wzmianki
slackcli mentions

# Przeczytaj konkretny kanał
slackcli read heheszki --limit 20
```

### Wysyłanie wiadomości

```bash
slackcli send general "Dzień dobry! 👋"
slackcli send cdp-devops "Deploy poszedł, sprawdzam logi"
```

### Koniec dnia

```bash
slackcli mark-read
```

### Odświeżenie tokena (gdy Slack odświeżył sesję)

```bash
slackcli import-desktop-token
```

---

## Troubleshooting {#troubleshooting}

### `Error: SLACK_TOKEN not set`
→ Uruchom `slackcli import-desktop-token` lub `slackcli login`

### `invalid_auth` / `token_revoked`
→ Token wygasł. Uruchom: `slackcli import-desktop-token`

### `enterprise_is_restricted`
→ Automatycznie obsługiwane — CLI używa alternatywnych endpointów API

### `channel_not_found`
→ Sprawdź nazwę kanału przez `slackcli channels` lub użyj ID kanału

### `import-desktop-token` nie znalazł tokena
→ Upewnij się że Slack desktop jest uruchomiony i zalogowany

### Port 3000 zajęty przy `login`
→ Zamknij inne procesy: `lsof -ti:3000 | xargs kill`

---

## Architektura techniczna {#architektura}

```
slack-cli/
├── index.js                    # CLI entry point (commander)
├── src/
│   ├── client.js               # Slack WebClient (lazy init, xoxc + cookie)
│   ├── auth.js                 # OAuth 2.0 flow (HTTPS localhost, self-signed cert)
│   ├── channels.js             # Kanały pogrupowane wg sekcji (client.counts + channelSections)
│   ├── read.js                 # Czytanie wiadomości (conversations.history)
│   ├── send.js                 # Wysyłanie wiadomości (chat.postMessage)
│   ├── mentions.js             # Wzmianki (search.messages)
│   ├── markread.js             # Mark all read (conversations.mark)
│   └── extract_desktop_token.py  # Python: wyciąga token z Slack desktop
├── .env                        # 🔒 gitignored — tokeny
├── .env.example                # Szablon zmiennych środowiskowych
└── package.json
```

### Kluczowe API Slack

| Endpoint | Użycie |
|---|---|
| `client.counts` | Lista kanałów użytkownika z unread status (internal API) |
| `users.channelSections.list` | Sekcje sidebar użytkownika |
| `conversations.info` | Nazwa i typ kanału po ID |
| `conversations.history` | Historia wiadomości kanału |
| `chat.postMessage` | Wysyłanie wiadomości |
| `search.messages` | Wzmianki i fallback dla enterprise |
| `conversations.mark` | Oznaczanie jako przeczytane |
| `auth.test` | Weryfikacja tokena |

### Jak działa ekstrakcja tokena z desktop app

```
~/.config/Slack/Local Storage/leveldb/  →  token xoxc-...
~/.config/Slack/Cookies (SQLite)        →  zaszyfrowane cookie d
org.freedesktop.secrets (DBus)          →  klucz AES (Slack Safe Storage)
  └─ PBKDF2(key, salt=saltysalt, 1 iter, 16B)  →  klucz deszyfrujący
  └─ AES-CBC(IV=16 spacji)              →  cookie xoxd-...
```

Token `xoxc-` + cookie `d=xoxd-...` są wysyłane razem w każdym żądaniu API.
