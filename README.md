# SSVC practitioner survey

The survey instrument for the thesis *Automating Environmental Decision Points
in Stakeholder-Specific Vulnerability Categorization: A Multi-Tenant
Evaluation Against CVSS-Based Remediation Baselines* (eMSc Information
Security, CICRA Campus / Asia e University).

Experienced practitioners rate 20 blinded scenarios (plus 3 repeats) for
System Exposure, Human Impact, the deployer action, and their confidence.
Their ratings are the benchmark against which the thesis compares the
automatically derived SSVC decisions (Arm C), the fixed defaults (Arm B) and
the CVSS threshold (Arm A).

The design is declared in the research repository
([`sandakelum97/ssvc-environmental-automation`](https://github.com/sandakelum97/ssvc-environmental-automation)),
in `PHASE3_PREREGISTRATION_ADDENDUM.md`:

| Entry | What it fixes |
| --- | --- |
| A38 | Sampling, blinding, rating scales, analysis plan, stopping rule |
| A39 | Asset cap and re-draw, withheld fields, display labels, the platform |
| A40 | The instrument as deployed, before the pilot |

## Live

https://ssvc-practitioner-survey.vercel.app/ (not indexed by search engines).
Do not complete the survey on the live site for testing: every submission is
stored. Test rows must be deleted and recorded (A40.11).

## How it works

```text
rater's browser ──> Vercel (static page, folder site/)
       │
       └── INSERT only ──> Supabase project ssvc-survey (South Asia, Mumbai)
```

- **The page** is plain HTML, CSS and JavaScript: no build step, no libraries,
  no cookies, no analytics, no external fonts. Its content-security policy
  (`site/vercel.json`) lets it contact only itself and Supabase.
- **The database** accepts inserts from the public role and nothing else. It
  cannot be read, changed or deleted from the page. Every allowed value is
  enforced by the database, and a trigger rejects any rating that does not
  match the rater's stored item order.
- **The research database (`ssvc-research`) is never contacted.**

## Repository layout

```text
site/                    The survey page (deployed; Vercel root directory)
  index.html             Screens, and the SSVC definitions shown to raters
  app.js                 Behaviour: order, resume, saving, save and exit
  order.js               Item order rule (same rule as the database)
  config.js              Settings: Supabase URL, publishable key, contact
  labels.json            Display labels (A39.4)
  survey_scenarios.json  The 20 scenarios, unchanged from the research repo
  styles.css             Appearance
  vercel.json            Security headers
db/
  schema.sql                   The database (run once on an empty project)
  test_schema.sql              Local test, PostgreSQL only; never on Supabase
  smoke_test_supabase.sql      Live check; acts as the public role, stores nothing
  harden_rls_auto_enable.sql   Security Advisor fix
docs/PASTE_GUIDE.md      Where each SSVC definition in index.html comes from
logs/                    Session logs, and daily checks while the survey is live
```

## Rules

1. **Keys.** `site/config.js` holds the Supabase **publishable** key only.
   The secret key never leaves Supabase and never enters this repository or a
   chat. Before every commit this must print `True`:
   `Select-String -Path site\config.js -Pattern 'SUPABASE_PUBLISHABLE_KEY:\s*"sb_publishable_' -Quiet`
2. **Versions.** The deployed commit and `SURVEY_VERSION` are recorded in an
   addendum before use. Any change after launch is a new version, recorded
   first.
3. **Blinding.** Colour marks sections, never values. No change may show
   CVE identifiers, dates, KEV status, EPSS or any arm's decision (A38.5).
4. **Definitions.** The SSVC texts in `site/index.html` are verbatim from
   CERT/CC; see `docs/PASTE_GUIDE.md`. Human Impact follows the official
   table DT_HI:1.0.0, with the researcher's corrected wording (CERTCC/SSVC
   pull request #1254) and a note on the discrepancy (A40.6).
5. **Records.** Committed logs are not edited; corrections are appended.

## Checks

| Check | How | Expected |
| --- | --- | --- |
| Schema test | `psql -U postgres -v ON_ERROR_STOP=1 -f db/test_schema.sql` (local PostgreSQL only) | `ALL TESTS PASSED` |
| Live check | Paste `db/smoke_test_supabase.sql` into the Supabase SQL editor (only while the tables are empty) | `Success. No rows returned` |
| Grants | Query in A40.2 | `anon` holds INSERT on `sessions`, `screening`, `responses` only |
| Headers | `curl.exe -sI https://ssvc-practitioner-survey.vercel.app/` | Content-Security-Policy, Referrer-Policy, X-Content-Type-Options, X-Robots-Tag |

## While the survey is live

Every day until it closes (18 October 2026, or 12 screened raters, A38.8):

1. Open the Supabase dashboard and confirm `ssvc-survey` is **not paused**.
   If it is, restore it: data is kept.
2. In the SQL editor: `INSERT INTO public.keepalive DEFAULT VALUES;`
3. Add the day's line to `logs/daily-checks.md`.

Free Supabase projects may pause after a week of insufficient activity (A40.10).

## Data protection

No name, email, employer or free text is collected. Raters withdraw by
emailing their completion code by 18 October 2026. Raw answers are deleted by
17 January 2027. No group smaller than five raters is reported by its
background answers (A40.8).
