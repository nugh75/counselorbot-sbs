# Architecture & Design Plan: Graphical ChatGPT Connection (#82)

**Status:** Phase 1 Investigation & Recommended Design  
**Task Reference:** GitHub Issue [#82](https://github.com/nugh75/counselorbot-sbs/issues/82)  
**Parent Documentation:** [`docs/operations/chatgpt-subscription.md`](./chatgpt-subscription.md)  
**Target Delivery:** Phase 2 (Implementation following user approval)

---

## 1. Executive Summary & Objective

Issue [#82](https://github.com/nugh75/counselorbot-sbs/issues/82) aims to enable students and teachers to connect their personal ChatGPT subscription from the CounselorBot web interface (`/profilo/chatgpt` and `/docente/chatgpt`) without requiring Python downloads or terminal commands.

In **Phase 1**, we conducted a technical investigation into whether an entirely browser-only flow (such as RFC 8628 OAuth 2.0 Device Code authorization or direct web redirect callback) is possible using OpenAI's official Sign in with ChatGPT (SIWC) protocol and token sharing preview. 

### Key Findings
1. **No Browser-Only Flow Supported:** The official OpenAI authentication issuer (`https://auth.openai.com`) **does not support the Device Authorization Grant (RFC 8628)** (`device_authorization_endpoint: None`). Furthermore, OpenAI's dynamic client registration mechanism (`client_id=dynamic_agent_client`) strictly requires loopback HTTP redirects to `http://127.0.0.1:<port>/auth/callback`. External web redirect URIs (`https://...`) are rejected by OpenAI for dynamic clients.
2. **Browser Sandbox Barrier:** Web browsers cannot bind TCP loopback ports due to security sandboxing. Without a local process listening on `127.0.0.1`, OpenAI's OAuth redirect fails with `ERR_CONNECTION_REFUSED`.
3. **Recommended Path:** A **guided graphical wizard** in `ChatGPTConnectionPanel.tsx` coupled with **native helpers for macOS and Windows** (downloadable with one click and requiring zero terminal/Python commands), retaining the Python CLI as an advanced fallback.

---

## 2. Investigation: Feasibility of a Browser-Only Flow

### 2.1 Analysis of Official OpenID Configuration
We inspected the live OpenID Connect discovery document at `https://auth.openai.com/.well-known/openid-configuration`:
- **Issuer:** `https://auth.openai.com`
- **Supported Response Types:** `["code"]`
- **Supported Grant Types:** `["authorization_code", "refresh_token"]`
- **Device Authorization Endpoint:** `None` (missing entirely from configuration)

RFC 8628 Device Authorization Flow (which allows a user to open an authorization URL on any device, enter an 8-character user code, and have the server poll for token issuance) is **not implemented** by OpenAI for ChatGPT sign-in.

### 2.2 Constraints of `dynamic_agent_client` & Redirect URIs
OpenAI's Token Sharing Preview for Open Source introduces dynamic agent registration using `client_id=dynamic_agent_client`.
Under this protocol:
1. The client must supply `client_id=dynamic_agent_client`, `agent_name_hint=CounselorBot`, `ext_agent_host_id=<host_id>`, and PKCE parameters (`code_challenge`, `code_challenge_method=S256`).
2. **Loopback Restriction:** The `redirect_uri` parameter is validated strictly by `auth.openai.com`. It **must** match the pattern `http://127.0.0.1:<port>/auth/callback`.
3. Supplying a remote HTTPS callback (such as `https://counselorbot.labform.net/api/chatgpt/auth/callback`) with `dynamic_agent_client` results in an immediate OAuth authorization rejection (`invalid_request` or `unsafe_url`).
4. OpenAI only permits remote web redirect URIs for pre-registered corporate partners with confidential OAuth client IDs and client secrets. This is not available for self-hosted open-source school deployments.

### 2.3 Evaluation of Manual Address-Bar Copy Fallback
If CounselorBot opened the OAuth URL with `redirect_uri=http://127.0.0.1:1455/auth/callback` in a popup or new tab without a local listener running:
- The browser completes the login at `auth.openai.com` and attempts to navigate to `http://127.0.0.1:1455/auth/callback?code=...&state=...`.
- Because nothing is listening on port 1455, the browser aborts navigation and renders a browser error page (`ERR_CONNECTION_REFUSED`).
- While desktop Chromium displays the failed URL in the address bar, asking users (especially school students and teachers) to copy a query parameter from an error page is:
  - **Severe UX failure:** Confusing and error-prone.
  - **Platform breakdown:** On mobile browsers (Safari on iOS, Chrome on Android) and managed Chromebooks, connection failure pages often replace or truncate the address bar with search queries or offline diagnostics.
  - **Security risk:** Exposes raw authorization codes in browser history, clipboard, and browser extensions without PKCE verification handshake.

### 2.4 Terms & Eligibility Constraints
According to OpenAI's Token Sharing Open Source preview documentation:
- **Intended Scope:** Local open-source tools and self-hosted personal VMs where the user retains local control of their tokens.
- **Plan Types:** Plus and Pro personal accounts. (Enterprise, Edu, and Business accounts are not verified or supported in the preview).
- **Token Transfer:** The preview requires secure loopback token transfer so credentials remain strictly on the user's personal machine before being safely encrypted and stored.

**Verdict:** A pure browser-only flow is technically unsupported by OpenAI SIWC. The project must use a **guided graphical wizard with native OS helpers**.

---

## 3. Evaluation of Native Helpers

To eliminate Python downloads and terminal usage for non-technical users, CounselorBot must provide native helpers for all major desktop platforms:

| Platform | Current State | Proposed Solution | User Experience |
| :--- | :--- | :--- | :--- |
| **macOS** | Native Swift App (`CounselorBot-ChatGPT.zip`) served from `/api/chatgpt/helper/macos` | Retain & integrate into wizard | Download ZIP, open app, paste code, click connect. No Python. |
| **Windows** | Python CLI only (blocks students/teachers without Python) | Standalone Windows Helper (`CounselorBot-ChatGPT-Windows.zip`) served from `/api/chatgpt/helper/windows` | Download ZIP, double-click `.exe`, paste code, click connect. No Python. |
| **Linux** | Python CLI (`chatgpt-connect.py`) | Retain Python script; optionally provide standalone binary package | Download or run script. |
| **SSH / Server** | Supported via `--no-browser --callback-port` | Retained under collapsible "Advanced / Manual" tab | Full SSH port-forwarding instructions preserved. |

### 3.1 Windows Native Helper Implementation Options
1. **PyInstaller Single-File Executable (Recommended):**
   - Freezes `chatgpt-connect.py` (and an optional minimal GUI or console dialog) into a single Windows PE binary: `CounselorBot-ChatGPT.exe`.
   - Packaged in `CounselorBot-ChatGPT-Windows.zip`.
   - Exactly identical networking, security validation, and safe error-masking as the Python script.
   - Built via `scripts/build-chatgpt-windows.sh` using cross-compilation (Wine/PyInstaller) or native Windows build runner.
2. **PowerShell Helper (`chatgpt-connect.ps1`):**
   - Built-in on Windows 10/11 using `System.Net.HttpListener`.
   - Drawback: School-managed computers frequently enforce `Set-ExecutionPolicy Restricted`, preventing execution of `.ps1` scripts without administrator privileges.
3. **Go / C# Native Executable:**
   - Lightweight, standalone binary.
   - Drawback: Requires additional toolchain maintenance compared to Python PyInstaller.

---

## 4. Recommended Design: Guided Graphical Wizard

The new interface transforms `ChatGPTConnectionPanel.tsx` into a 4-state visual wizard that guides the user intuitively without technical jargon.

### 4.1 Four Core States
1. **State 1: Not Connected (`not_connected`)**
   - Displays clear introductory copy: explains personal ChatGPT connection, privacy preservation, zero API billing, and independent model access.
   - Auto-detects client OS via `navigator.userAgent` to present the optimal helper option.
   - Primary Action: **"Collega ChatGPT"** (`POST /api/user/chatgpt/link`).
2. **State 2: Waiting for Sign-in (`waiting_for_sign_in`)**
   - Active pairing code displayed in an accessible, highlighted card with 1-click copy.
   - 10-minute countdown indicator (`expires_at`).
   - Visual 3-step guide:
     - **Step 1:** Download & open the helper for the user's OS (macOS app or Windows app).
     - **Step 2:** Paste the pairing code into the helper.
     - **Step 3:** Complete the official sign-in in the OpenAI browser window.
   - Real-time polling indicator: "In attesa dell'accesso da ChatGPT..." with animated pulse.
   - Secondary Action: **"Annulla"** (`DELETE /api/user/chatgpt/link`) to cleanly cancel pairing.
   - Collapsible accordion for "Manuale (Terminale Python / SSH)" for power users.
3. **State 3: Connected (`connected`)**
   - Displays connection badge with verified account email (`status.email`).
   - Model dropdown populated dynamically via `POST /api/user/chatgpt/models`.
   - Two sub-states:
     - **Inactive:** "Usa il mio abbonamento" toggle off. Primary button: **"Usa il mio abbonamento"** (`PUT /api/user/chatgpt/preference`).
     - **Active:** "Abbonamento attivo · <modello>". Primary button: **"Torna al modello dell'istituto"**.
   - Management actions:
     - "Aggiorna elenco modelli" (`POST /api/user/chatgpt/models`).
     - "Scollega" (`DELETE /api/user/chatgpt`).
     - External link to OpenAI Usage Dashboard (`https://chatgpt.com/settings/usage`).
4. **State 4: Expired / Error with Retry (`expired` / `error`)**
   - Replaces technical error codes with friendly, localized error messages:
     - Code expired: *"Il codice di associazione è scaduto."*
     - Permission denied: *"Il tuo account non ha autorizzato l'accesso ai modelli."*
     - Reconnection required: *"La sessione ChatGPT è scaduta. Ricollega il tuo account."*
     - Quota exhausted: *"Quota del piano personale esaurita su ChatGPT."*
   - Primary Action: **"Riprova collegamento"** (immediately invokes `POST /api/user/chatgpt/link` without page reload).
   - Troubleshooting help collapsible: port 1455 troubleshooting, school firewall notes.

---

## 5. Architectural & Security Guarantees (Strictly Preserved)

The following security properties are strictly maintained and must not be altered:

1. **Per-User Credential Encryption Unchanged:**
   - Fernet symmetric encryption via server-managed `CredentialStore("CHATGPT", "chatgpt_credentials")`.
   - Credentials stored encrypted in PostgreSQL `chatgpt_connections` table.
   - Tokens never sent in API responses to the browser.
2. **No Paid Failover:**
   - When a user's ChatGPT quota is exhausted or token is rejected, requests fail closed with a clear user alert.
   - CounselorBot **never** falls back to platform API keys, system models, or local models silently when personal mode is active.
3. **Admin Policy Default Off Unchanged:**
   - `Config.chatgpt_enabled` defaults to `false`.
   - Feature is only enabled when an administrator explicitly toggles it via **Amministrazione → Configurazione → Generale → Collegamento ChatGPT** (`PUT /api/admin/chatgpt/settings`).
4. **Anti-CSRF & Origin Verification:**
   - Browser mutations require `X-Requested-With: CounselorBot`.
   - Pairing routes (`/api/chatgpt/link/*`) require `Authorization: Bearer <pairing_code>`.

---

## 6. Endpoints Specification

### 6.1 Existing Endpoints (Preserved)
- `GET /api/admin/chatgpt/settings`: Administrator check for installation status.
- `PUT /api/admin/chatgpt/settings`: Administrator toggle (`enabled: true/false`).
- `GET /api/user/chatgpt`: Authenticated user status (returns availability, email, active model, etc.).
- `POST /api/user/chatgpt/link`: Starts pairing, returns pairing code, expiry, and host ID.
- `DELETE /api/user/chatgpt/link`: Cancels pending pairing link.
- `GET /api/chatgpt/link/parameters`: Helper reads nonce and client ID using bearer pairing code.
- `POST /api/chatgpt/link/registration`: Helper persists issued `client_id`.
- `POST /api/chatgpt/link/complete`: Helper uploads encrypted token payload.
- `POST /api/user/chatgpt/models`: Fetches live available model catalog from OpenAI.
- `PUT /api/user/chatgpt/preference`: Selects model and toggles `use_subscription`.
- `DELETE /api/user/chatgpt`: Disconnects account and revokes tokens.
- `GET /api/chatgpt/helper`: Downloads Python helper script (`chatgpt-connect.py`).
- `GET /api/chatgpt/helper/macos`: Downloads native macOS helper ZIP (`CounselorBot-ChatGPT.zip`).

### 6.2 New & Extended Endpoints (Phase 2)
- `GET /api/chatgpt/helper/windows`:
  - Serves `CounselorBot-ChatGPT-Windows.zip` (containing the standalone Windows executable).
  - Requires authenticated session, returns `application/zip` with `Cache-Control: no-store`.
  - Returns 404 if operator has not built/provided the Windows helper.
- `GET /api/chatgpt/helper/linux`:
  - Serves `CounselorBot-ChatGPT-Linux.tar.gz` (if standalone Linux distribution is enabled).
- Extended response for `GET /api/user/chatgpt`:
  ```json
  {
    "available": true,
    "enabled": true,
    "connected": false,
    "macos_helper_available": true,
    "windows_helper_available": true,
    "linux_helper_available": false,
    "email": null,
    "use_subscription": false,
    "model": null,
    "needs_reconnect": false,
    "pending_link": false,
    "models": []
  }
  ```

---

## 7. Panel UI ASCII Mockups

### State 1: Not Connected (Initial Wizard View)
```text
+-----------------------------------------------------------------------+
|  Collega il tuo abbonamento ChatGPT                                  |
|                                                                       |
|  Puoi usare il tuo abbonamento personale ChatGPT (Plus o Pro) per     |
|  dialogare con il Counselor senza costi per l'istituto.               |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |  Dispositivo rilevato: Windows                                  |  |
|  |  Collega il tuo account in modo guidato in 3 semplici passaggi  |  |
|  |  senza usare il terminale.                                      |  |
|  +-----------------------------------------------------------------+  |
|                                                                       |
|  [ Inizia collegamento ]                                              |
|                                                                       |
|  > Termini e privacy: le tue chat restano su CounselorBot.           |
+-----------------------------------------------------------------------+
```

### State 2: Waiting for Sign-in (Pairing in Progress)
```text
+-----------------------------------------------------------------------+
|  Collega il tuo abbonamento ChatGPT                                  |
|                                                                       |
|  +-----------------------------------------------------------------+  |
|  |  PASSO 1: Scarica l'assistente per il tuo computer              |  |
|  |  [ Scarica per Windows (ZIP) ]   (oppure: macOS / Linux)        |  |
|  +-----------------------------------------------------------------+  |
|  |  PASSO 2: Inserisci il codice di associazione                   |  |
|  |                                                                 |  |
|  |  Codice: [ ab12-cd34-ef56-gh78-ij90-kl12-mn34-op56 ]  [Copia]   |  |
|  |  Scadenza: 09:42 rimanenti                                      |  |
|  +-----------------------------------------------------------------+  |
|  |  PASSO 3: Accedi su ChatGPT nella finestra che si apre          |  |
|  |  L'assistente completerà automaticamente il collegamento.       |  |
|  +-----------------------------------------------------------------+  |
|                                                                       |
|  (*) In attesa del completamento dell'accesso...                      |
|                                                                       |
|  [ Annulla collegamento ]                                             |
|                                                                       |
|  v Alternativa avanzata (Terminale Python / SSH)                      |
+-----------------------------------------------------------------------+
```

### State 3A: Connected (Inactive / Choosing Model)
```text
+-----------------------------------------------------------------------+
|  Collega il tuo abbonamento ChatGPT                                  |
|                                                                       |
|  (v) Collegato con successo: mario.rossi@example.com                  |
|                                                                       |
|  Scegli il modello da utilizzare:                                     |
|  [ gpt-4o (Consigliato)                                          v ]  |
|                                                                       |
|  [ Usa il mio abbonamento ]   [ Aggiorna modelli ]   [ Scollega ]     |
|                                                                       |
|  Attualmente è attivo il modello dell'istituto.                       |
|  Verifica i tuoi limiti di utilizzo su chatgpt.com/settings/usage     |
+-----------------------------------------------------------------------+
```

### State 3B: Connected & Active (Subscription In Use)
```text
+-----------------------------------------------------------------------+
|  Collega il tuo abbonamento ChatGPT                                  |
|                                                                       |
|  (v) Collegato · mario.rossi@example.com                              |
|  (*) ABBONAMENTO ATTIVO: gpt-4o                                       |
|                                                                       |
|  Tutte le conversazioni utilizzano la tua quota personale ChatGPT.    |
|                                                                       |
|  [ Torna al modello dell'istituto ]                 [ Scollega ]      |
|                                                                       |
|  Verifica i tuoi limiti di utilizzo su chatgpt.com/settings/usage     |
+-----------------------------------------------------------------------+
```

### State 4: Expired / Error with Retry
```text
+-----------------------------------------------------------------------+
|  Collega il tuo abbonamento ChatGPT                                  |
|                                                                       |
|  /!\ Il codice di associazione è scaduto prima del completamento.     |
|      Non è stato salvato alcun dato. Puoi riprovare subito.           |
|                                                                       |
|  [ Riprova collegamento ]                                             |
|                                                                       |
|  v Risoluzione problemi e verifiche di rete                           |
+-----------------------------------------------------------------------+
```

---

## 8. Testing Strategy

### 8.1 Backend Tests (`pytest`)
1. **Helper Serving Tests (`test_chatgpt_helper_transport.py` & `test_chatgpt_windows_helper.py`):**
   - Serving Windows helper ZIP with correct headers (`application/zip`, `Cache-Control: no-store`).
   - 401 Unauthorized when unauthenticated.
   - 404 Not Found when helper archive is not present on disk.
2. **Pairing Lifecycle Tests (`test_chatgpt_subscription.py`):**
   - Link generation with 10-minute expiry deadline.
   - Token parameters and registration flow.
   - Expiration and cancellation handling.
   - Error mapping for expired links and invalid credentials.

### 8.2 Frontend Playwright Tests (`chatgpt-subscription.test.mjs`)
1. **All 4 States Tested in 6 Languages:**
   - Italian (`it`), English (`en`), Spanish (`es`), French (`fr`), German (`de`), Swedish (`sv`).
2. **Responsive Layouts:**
   - Mobile viewport (`390px`) and Desktop viewport (`1440px`).
3. **Behavioral Scenarios:**
   - Not connected -> click connect -> waiting for sign-in displayed.
   - Copy button writes pairing code to clipboard.
   - Cancel button cleanly resets panel to State 1.
   - Helper download links adapt to detected OS.
   - Successful pairing -> model selector populated -> save preference.
   - Error injection (expired code / timeout) -> verify error alert and "Riprova" button resumes pairing.

---

## 9. Next Steps for Phase 2 (Implementation)

Once this Phase 1 design plan is approved by the user, Phase 2 will execute the following steps:
1. **Backend:**
   - Implement `windows_helper_available()` and `GET /api/chatgpt/helper/windows` in `backend/routes/chatgpt.py`.
   - Update `status()` payload in `backend/chatgpt_connections.py` with `windows_helper_available`.
   - Add backend tests in `backend/tests/test_chatgpt_windows_helper.py`.
2. **Windows Helper Packaging:**
   - Create Windows standalone helper build script (`scripts/build-chatgpt-windows.sh`) and operator documentation.
3. **Frontend:**
   - Refactor `ChatGPTConnectionPanel.tsx` into the guided 4-state graphical wizard with OS auto-detection.
   - Add internationalized strings across all 6 language dictionaries in `frontend/src/lib/i18n-chatgpt.ts` and `backend/chatgpt_i18n.json`.
   - Update Playwright test suite in `frontend/tests/chatgpt-subscription.test.mjs`.
4. **Documentation & Validation:**
   - Update `docs/operations/chatgpt-subscription.md`, product guide, and run `make guidance-refresh` / `make guidance-check`.
