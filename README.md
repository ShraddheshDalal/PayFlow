# PayFlow — Smart UPI Payment System

> **Payments made simple. Control made smarter.**

PayFlow is a responsive web application that **simulates** UPI payments. It was built for the
*Agile Software Development FA2* assignment to demonstrate a complete CI/CD pipeline:

```
GitHub → Build → Automated Testing → Code Quality Check → Deployment
```

> ⚠️ **Demo Mode — No Real Money Is Transferred.**
> PayFlow never connects to a bank, UPI network or payment provider. It never asks for a UPI PIN,
> OTP, password or card details. All balances, recipients and transaction references are fictional.

It continues the online-payments domain of our earlier PhonePe Agile case study, but has its own
name, branding, interface and implementation.

---

## Objectives

- Build a polished, working payment web app with plain HTML, CSS and JavaScript.
- Keep payment business rules in a separate, DOM-free module so they can be unit-tested in Node.js.
- Provide real, deterministic automated tests and an ESLint code-quality gate.
- Deliver every change through a GitHub Actions pipeline that deploys only after all checks pass.

## Features

- **Dashboard (Overview)** – welcome banner, demo wallet balance, total / successful / failed
  payment counts (all computed from the transaction list), five most recent transactions and
  quick actions.
- **Send Money** – recipient name, UPI ID, amount (₹) and optional note; field-level validation
  that updates as you type; recent recipients for one-click fill.
- **Confirmation → processing → result** – review panel, short processing state, duplicate-submit
  protection and a success/failure result with a unique reference and timestamp.
- **Transaction history** – search (recipient, UPI ID, reference), status filter (All / Success /
  Failed), newest/oldest sort, all combined; empty state; Clear Filters; detail modal per transaction.
- **Demo data** – stored in `localStorage` so it survives refreshes; **Reset Demo Data** (with
  confirmation) restores the original ₹25,000.00 balance and sample transactions.
- **About Project** – objective, workflow, features, stack, Agile process and pipeline.
- Responsive (desktop sidebar, compact tablet sidebar, mobile off-canvas menu), keyboard
  accessible, visible focus states, accessible `<dialog>` modals and `prefers-reduced-motion` support.

## Technology stack

| Area | Technology |
| --- | --- |
| Frontend | HTML5, CSS3, vanilla JavaScript (ES modules) |
| Runtime / packages | Node.js 20+ (22 recommended), npm |
| Tests | Node.js built-in test runner (`node:test`, `node:assert/strict`) |
| Code quality | ESLint 9 (flat config) |
| Dev server | `scripts/serve.js` – tiny zero-dependency Node.js static server |
| CI/CD | GitHub Actions |
| Hosting | GitHub Pages (static files from `dist/`) |

The only npm dependencies are development tools: `eslint`, `@eslint/js` and `globals`.

## Folder structure

```
PayFlow/
├── index.html                  # App markup: sidebar, views, dialogs, SVG icons
├── css/
│   └── styles.css              # Dark fintech theme + responsive layout
├── js/
│   ├── app.js                  # Browser UI: rendering, navigation, events
│   ├── payment-service.js      # Pure payment rules (validation, processing, stats, filters)
│   └── storage.js              # localStorage persistence for demo data
├── tests/
│   └── payment-service.test.js # node:test unit tests
├── scripts/
│   ├── build.js                # Validation + packaging into dist/
│   └── serve.js                # Local static development server
├── .github/
│   └── workflows/
│       └── ci.yml              # Build → test → lint → deploy pipeline
├── eslint.config.js
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

### Architecture

```
index.html ──loads──▶ js/app.js ──imports──▶ js/payment-service.js ◀──imports── tests/*.test.js
                          │                         ▲
                          └──imports──▶ js/storage.js ┘
```

- `payment-service.js` has **no DOM access** and receives the current time as a parameter, so all
  outcomes are deterministic and testable.
- `storage.js` accepts an injectable storage object (the browser's `localStorage` by default; an
  in-memory fake in tests).
- `app.js` only renders state and wires events; it never re-implements validation.
- All money is stored as integer **paise** to avoid floating-point rounding errors.

## Prerequisites

- [Node.js](https://nodejs.org/) **20 or newer** (LTS 22 recommended) – includes npm.
- [Git](https://git-scm.com/).
- Any modern browser (Chrome, Edge, Firefox).
- VS Code (optional).

Check your versions (Command Prompt or PowerShell):

```powershell
node -v
npm -v
git --version
```

## Installation

```powershell
git clone https://github.com/<your-username>/PayFlow.git
cd PayFlow
npm install
```

(`npm ci` gives an exact, reproducible install from `package-lock.json`; CI uses it.)

## Run locally

```powershell
npm start
```

Open **http://localhost:3000** in your browser. Press `Ctrl+C` in the terminal to stop.

Use a different port if 3000 is busy:

```powershell
# PowerShell
$env:PORT=8080; npm start
# Command Prompt
set PORT=8080 && npm start
```

> Opening `index.html` directly with a `file://` URL will **not** work, because browsers block
> ES modules from `file://`. Always use `npm start` (or any static server).

To preview the production build exactly as it will be deployed:

```powershell
npm run build
npm run preview
```

## Automated tests

```powershell
npm test
```

Runs `node --test`, which discovers `tests/payment-service.test.js`. The suite covers:

| # | Requirement | Test(s) |
| --- | --- | --- |
| 1 | Valid recipient and positive amount pass | `accepts a valid recipient, UPI ID and positive amount` |
| 2 | Empty recipient name rejected | `rejects an empty recipient name` |
| 3 | Empty UPI ID rejected | `rejects an empty UPI ID` |
| 4 | Invalid UPI format rejected | `rejects invalid UPI ID formats` |
| 5 | Zero amount rejected | `rejects a zero amount` |
| 6 | Negative amount rejected | `rejects negative amounts` |
| 7 | Non-numeric / NaN / Infinity rejected | `rejects non-numeric, NaN, Infinity and malformed amounts` |
| 8 | Above transaction limit rejected | `rejects an amount above the per-payment transaction limit` |
| 9 | Above wallet balance rejected | `rejects an amount above the simulated wallet balance` |
| 10 | Success deducts the correct amount | `deducts the exact amount from the balance for a successful payment` |
| 11 | Rejected / failed payment does not deduct | `rejects invalid details without deducting…`, `records a FAILED transaction… without deducting` |
| 12 | References generated, records complete | `creates transaction records containing all required fields`, `generates unique references…`, `generateReference` suite |

Additional tests cover determinism, immutability, statistics, search/filter/sort, recent
recipients and storage (save/load, corrupted data, reset, quota errors). Tests use no DOM,
network, real payment service or randomness.

## Code quality (ESLint)

```powershell
npm run lint
```

Runs `eslint . --max-warnings=0` using `eslint.config.js` (ESLint recommended rules plus
`eqeqeq`, `no-unused-vars`, `prefer-const`, `no-console`, `curly`, consistent indentation/quotes/
semicolons). Browser globals apply to `js/`, Node.js globals to `tests/` and `scripts/`.
`npm run lint:fix` fixes auto-fixable issues.

## Build

```powershell
npm run build
```

`scripts/build.js` performs real checks and fails (non-zero exit) on any problem:

1. All required project files exist.
2. Every JavaScript file passes `node --check` syntax validation.
3. Every local file referenced by `index.html` exists.
4. Every element ID used by `js/app.js` exists in `index.html`.
5. All relative ES module imports resolve.
6. Copies the deployable site (`index.html`, `css/`, `js/`, `.nojekyll`) into `dist/`.

Run everything in one go:

```powershell
npm run check
```

## Simulated payment rules

| Rule | Behaviour |
| --- | --- |
| Recipient name | Required, ≤ 50 characters, must contain letters |
| UPI ID | Required; simple demo format `identifier@handle` – identifier 2–64 chars of letters, digits, `.`, `_`, `-`; handle 2–32 chars starting with a letter, letters/digits only. This is a deliberately simple demo check, **not** an authoritative definition of every real-world UPI address. |
| Amount | Required; a number with up to 2 decimals; rejects zero, negatives, NaN, Infinity and text |
| Minimum | ₹1.00 |
| Per-payment limit | ₹10,000.00 |
| Balance | Amount must not exceed the current demo wallet balance |
| Note | Optional, ≤ 100 characters |
| Demo decline rule | Any UPI ID on the fictional `@declinebank` handle is **declined** by the simulated bank. A *Failed* transaction is recorded and **no money is deducted**. |
| Outcome | Every other valid payment **succeeds deterministically** – there is no randomness. |
| Reference | `PF` + UTC date (`YYYYMMDD`) + 6-digit sequence, e.g. `PF20261013000007` |

Invalid details are never processed: no transaction is recorded and the balance is unchanged.
Validation runs in JavaScript (the form uses `novalidate`; HTML attributes are not relied on) and
is re-run at the moment of processing.

## Data & demo safety

- Only non-sensitive, fictional demo data (balance, sample transactions) is kept in the browser's
  `localStorage` under the key `payflow.demoState.v1`.
- No credentials, PINs, OTPs, passwords, card details, secrets or API keys exist in the project.
- Sample transactions are marked as *Fictional sample* in their detail view.
- **Reset Demo Data** (Overview → Quick Actions) asks for confirmation, then restores the
  original state.

## How to verify the app manually

1. **Dashboard** – `npm start`, open http://localhost:3000. Balance shows ₹25,000.00, 6 total,
   4 successful, 2 failed, and 5 recent rows.
2. **Validation** – Send Money → click *Review Payment* with an empty form: three field errors
   appear. Type a name: its error disappears. Try UPI `abc`, amounts `0`, `-5`, `abc`, `10001`.
3. **Successful payment** – Name `Ananya Rao`, UPI `ananya@okpayflow`, amount `1500.50` →
   Review → Confirm Demo Payment → processing → *Payment Successful*. Back to Dashboard:
   balance ₹23,499.50, totals 7 / 5 / 2.
4. **Failed payment** – UPI `test@declinebank`, amount `100` → *Payment Failed*; balance unchanged,
   failed count +1.
5. **History** – Transactions: search `priya`, filter *Failed*, sort *Oldest first*, search
   `zzz` to see the empty state, then *Clear Filters*. Click a row (or focus it and press Enter)
   to open details.
6. **Persistence & reset** – refresh the page (data stays); Overview → *Reset Demo Data* →
   confirm (data returns to the original sample).
7. **Responsive** – resize the window or use browser dev tools (e.g. 375 px wide): the menu
   button opens the navigation; no horizontal scrolling.

## Pre-push checklist

All of these must pass before pushing:

```powershell
npm ci
npm run build
npm test
npm run lint
```

## GitHub Actions & deployment

The workflow `.github/workflows/ci.yml` runs on pushes and pull requests to `main`:

1. Checkout the repository.
2. Set up Node.js 22 (with npm cache).
3. `npm ci` (reproducible install).
4. `npm run build`.
5. `npm test`.
6. `npm run lint`.
7. **Deploy** to GitHub Pages — a separate job that `needs` the checks job, so it runs **only**
   if build, tests and lint all succeed, and **only** for pushes to `main` (never for pull requests).

GitHub Pages serves static files only, so the pipeline deploys the `dist/` folder produced by
`npm run build`; the Node.js dev server is not used in production.

### One-time manual setup (required)

1. Push the project to a GitHub repository with a `main` branch.
2. In the repository: **Settings → Pages → Build and deployment → Source: _GitHub Actions_**.
3. Push to `main` (or run the workflow from the **Actions** tab). The deploy job prints the site URL,
   usually `https://<your-username>.github.io/<repository-name>/`.
4. Optional: **Settings → Branches → Add branch protection rule** for `main` requiring the
   *Build, test and lint* check, so pull requests cannot merge while it fails.

No tokens or secrets need to be added – the workflow uses GitHub's built-in OIDC permissions
(`pages: write`, `id-token: write`) scoped to the deploy job.

---

PayFlow is an academic project. It does not process real payments and is not affiliated with any
bank, payment app or NPCI.
