# Logs

## Session logs: in the research repository

Every working session on this survey is logged in the research repository,
`sandakelum97/ssvc-environmental-automation`, in `logs/`, continuing its
session numbers and its E-series of process errors. Keeping one series in one
place keeps the project's history in order. Session 19 (27 September 2026)
covers building, testing and deploying this instrument.

## Daily checks: here

[`daily-checks.md`](daily-checks.md) has one line per day while the survey is
live, from launch to close. It records that the project was checked, whether
it had paused, the keep-alive row, and the day's totals, read in the
Supabase SQL editor with:

```sql
SELECT (SELECT count(*) FROM sessions) AS sessions,
       (SELECT count(*) FROM screening WHERE years_band <> 'lt_2') AS screened,
       (SELECT count(*) FROM (SELECT session_id FROM responses
                              GROUP BY session_id HAVING count(*) = 23) c) AS completed;
```

Only totals are recorded. No rating is read or summarised until the analysis
script is committed and tagged (A38.7).

Committed lines are not edited. A correction is a new line that says what it
corrects.
