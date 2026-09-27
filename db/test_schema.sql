-- =====================================================================
-- db/test_schema.sql — LOCAL PostgreSQL ONLY. Never run on Supabase.
--
-- Creates a throwaway database, imitates Supabase's roles and default
-- grants, loads db/schema.sql, then acts as the public role (anon):
--   * valid inserts must succeed;
--   * every rule-breaking insert must fail with the expected error;
--   * any read, update or delete must be refused.
-- The run stops at the first failure (ON_ERROR_STOP). A clean run ends
-- with "ALL TESTS PASSED".
--
-- Run from the repository root:
--   psql -U postgres -v ON_ERROR_STOP=1 -f db/test_schema.sql
-- =====================================================================

\set QUIET on
DROP DATABASE IF EXISTS survey_schema_test;
CREATE DATABASE survey_schema_test;
\connect survey_schema_test
\set QUIET on

-- Imitate Supabase: its API roles, and its default grant of every new
-- public table to them. The schema must undo that grant itself.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')          THEN CREATE ROLE anon NOLOGIN;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;

\i db/schema.sql

-- Test helpers, owned by postgres, callable by anon.
CREATE SCHEMA t;
GRANT USAGE ON SCHEMA t TO anon;

CREATE FUNCTION t.expect_fail(label text, stmt text, code text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> code THEN
      RAISE EXCEPTION 'FAIL [%]: expected %, got % (%)', label, code, SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'ok   refused  %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL [%]: statement succeeded but should have been refused', label;
END $$;

CREATE FUNCTION t.expect_ok(label text, stmt text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE NOTICE 'ok   accepted %', label;
END $$;

\set QUIET off
SET client_min_messages = notice;

-- A valid order: 1..20, then repeats 2, 6, 12 (gaps 20, 16, 11).
-- Boundary orders for scenario 12: gap 9 is allowed, gap 8 is not.
\set good   '''{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,2,6,12}'''
\set gap9   '''{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,12,2,6}'''
\set gap8   '''{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,12,20,2,6}'''
\set S1     '''11111111-1111-4111-8111-111111111111'''
\set S2     '''22222222-2222-4222-8222-222222222222'''

SET ROLE anon;

-- ---------------- sessions ----------------
SELECT t.expect_ok  ('session, valid order',
  format('INSERT INTO public.sessions (session_id, survey_version, item_order, consent_given) VALUES (%L, %L, %L, true)', :S1, 'v1', :good));
SELECT t.expect_ok  ('session, repeat gap 9 (boundary allowed)',
  format('INSERT INTO public.sessions (session_id, survey_version, item_order, consent_given) VALUES (%L, %L, %L, true)', :S2, 'v1', :gap9));
SELECT t.expect_fail('session, repeat gap 8',
  format('INSERT INTO public.sessions (session_id, survey_version, item_order, consent_given) VALUES (gen_random_uuid(), %L, %L, true)', 'v1', :gap8), '23514');
SELECT t.expect_fail('session, 20 items only',
  $q$INSERT INTO public.sessions (session_id, survey_version, item_order, consent_given) VALUES (gen_random_uuid(), 'v1', '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20}', true)$q$, '23514');
SELECT t.expect_fail('session, scenario 21 present',
  $q$INSERT INTO public.sessions (session_id, survey_version, item_order, consent_given) VALUES (gen_random_uuid(), 'v1', '{21,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,2,6,12}', true)$q$, '23514');
SELECT t.expect_fail('session, wrong scenario repeated (5 instead of 12)',
  $q$INSERT INTO public.sessions (session_id, survey_version, item_order, consent_given) VALUES (gen_random_uuid(), 'v1', '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,2,6,5}', true)$q$, '23514');
SELECT t.expect_fail('session, NULL inside order',
  $q$INSERT INTO public.sessions (session_id, survey_version, item_order, consent_given) VALUES (gen_random_uuid(), 'v1', '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,2,6,NULL}', true)$q$, '23514');
SELECT t.expect_fail('session, wrong version',
  format('INSERT INTO public.sessions (session_id, survey_version, item_order, consent_given) VALUES (gen_random_uuid(), %L, %L, true)', 'v2', :good), '23514');
SELECT t.expect_fail('session, consent false',
  format('INSERT INTO public.sessions (session_id, survey_version, item_order, consent_given) VALUES (gen_random_uuid(), %L, %L, false)', 'v1', :good), '23514');
SELECT t.expect_fail('session, anon sets its own timestamp',
  format('INSERT INTO public.sessions (session_id, survey_version, item_order, consent_given, started_at) VALUES (gen_random_uuid(), %L, %L, true, now())', 'v1', :good), '42501');
SELECT t.expect_fail('session, same id twice',
  format('INSERT INTO public.sessions (session_id, survey_version, item_order, consent_given) VALUES (%L, %L, %L, true)', :S1, 'v1', :good), '23505');

-- ---------------- screening ----------------
SELECT t.expect_ok  ('screening, valid',
  format($q$INSERT INTO public.screening (session_id, years_band, role_band, works_at_mssp, used_ssvc_before) VALUES (%L, '5_9', 'engineer', true, false)$q$, :S1));
SELECT t.expect_ok  ('screening, lt_2 accepted (excluded at analysis, A38.6)',
  format($q$INSERT INTO public.screening (session_id, years_band, role_band, works_at_mssp, used_ssvc_before) VALUES (%L, 'lt_2', 'analyst', false, false)$q$, :S2));
SELECT t.expect_fail('screening, years band not declared',
  $q$INSERT INTO public.screening (session_id, years_band, role_band, works_at_mssp, used_ssvc_before) VALUES (gen_random_uuid(), '3', 'engineer', true, false)$q$, '23514');
SELECT t.expect_fail('screening, role "other" (not in A38.6)',
  format($q$INSERT INTO public.screening (session_id, years_band, role_band, works_at_mssp, used_ssvc_before) VALUES (%L, '2_4', 'other', true, false)$q$, :S1), '23514');
SELECT t.expect_fail('screening, missing answer',
  format($q$INSERT INTO public.screening (session_id, years_band, role_band, works_at_mssp) VALUES (%L, '2_4', 'lead', true)$q$, :S1), '23502');
SELECT t.expect_fail('screening, unknown session',
  $q$INSERT INTO public.screening (session_id, years_band, role_band, works_at_mssp, used_ssvc_before) VALUES (gen_random_uuid(), '2_4', 'lead', true, true)$q$, '23503');
SELECT t.expect_fail('screening, second time for same session',
  format($q$INSERT INTO public.screening (session_id, years_band, role_band, works_at_mssp, used_ssvc_before) VALUES (%L, '2_4', 'lead', true, true)$q$, :S1), '23505');

-- ---------------- responses ----------------
-- All 23 items for session S1, in its stored order.
SELECT t.expect_ok  ('responses, all 23 items in stored order',
  format($q$INSERT INTO public.responses (session_id, position, scenario, showing, system_exposure, human_impact, action, confidence)
            SELECT %L, i, o[i], CASE WHEN i > 20 THEN 2 ELSE 1 END, 'controlled', 'medium', 'scheduled', 3
              FROM (SELECT %L::smallint[] AS o) x, generate_series(1, 23) AS i$q$, :S1, :good));
SELECT t.expect_fail('response, wrong scenario for position',
  format($q$INSERT INTO public.responses (session_id, position, scenario, showing, system_exposure, human_impact, action, confidence) VALUES (%L, 1, 5, 1, 'open', 'low', 'defer', 3)$q$, :S2), '23514');
SELECT t.expect_fail('response, repeat marked as first showing',
  format($q$INSERT INTO public.responses (session_id, position, scenario, showing, system_exposure, human_impact, action, confidence) VALUES (%L, 23, 6, 1, 'open', 'low', 'defer', 3)$q$, :S2), '23514');
SELECT t.expect_fail('response, second showing of a non-repeat',
  format($q$INSERT INTO public.responses (session_id, position, scenario, showing, system_exposure, human_impact, action, confidence) VALUES (%L, 5, 5, 2, 'open', 'low', 'defer', 3)$q$, :S2), '23514');
SELECT t.expect_fail('response, CISA outcome "track"',
  format($q$INSERT INTO public.responses (session_id, position, scenario, showing, system_exposure, human_impact, action, confidence) VALUES (%L, 1, 1, 1, 'open', 'low', 'track', 3)$q$, :S2), '23514');
SELECT t.expect_fail('response, "very high" with a space',
  format($q$INSERT INTO public.responses (session_id, position, scenario, showing, system_exposure, human_impact, action, confidence) VALUES (%L, 1, 1, 1, 'open', 'very high', 'defer', 3)$q$, :S2), '23514');
SELECT t.expect_fail('response, exposure "unknown"',
  format($q$INSERT INTO public.responses (session_id, position, scenario, showing, system_exposure, human_impact, action, confidence) VALUES (%L, 1, 1, 1, 'unknown', 'low', 'defer', 3)$q$, :S2), '23514');
SELECT t.expect_fail('response, confidence 6',
  format($q$INSERT INTO public.responses (session_id, position, scenario, showing, system_exposure, human_impact, action, confidence) VALUES (%L, 1, 1, 1, 'open', 'low', 'defer', 6)$q$, :S2), '23514');
SELECT t.expect_fail('response, confidence missing',
  format($q$INSERT INTO public.responses (session_id, position, scenario, showing, system_exposure, human_impact, action) VALUES (%L, 1, 1, 1, 'open', 'low', 'defer')$q$, :S2), '23502');
SELECT t.expect_fail('response, same item twice',
  format($q$INSERT INTO public.responses (session_id, position, scenario, showing, system_exposure, human_impact, action, confidence) VALUES (%L, 1, 1, 1, 'open', 'low', 'defer', 3)$q$, :S1), '23505');
SELECT t.expect_fail('response, unknown session',
  $q$INSERT INTO public.responses (session_id, position, scenario, showing, system_exposure, human_impact, action, confidence) VALUES (gen_random_uuid(), 1, 1, 1, 'open', 'low', 'defer', 3)$q$, '23514');

-- ---------------- the public role cannot read, change or delete --------
SELECT t.expect_fail('read sessions',        'SELECT * FROM public.sessions',              '42501');
SELECT t.expect_fail('read screening',       'SELECT * FROM public.screening',             '42501');
SELECT t.expect_fail('read responses',       'SELECT * FROM public.responses',             '42501');
SELECT t.expect_fail('count responses',      'SELECT count(*) FROM public.responses',      '42501');
SELECT t.expect_fail('update responses',     $q$UPDATE public.responses SET action = 'immediate'$q$, '42501');
SELECT t.expect_fail('delete responses',     'DELETE FROM public.responses',               '42501');
SELECT t.expect_fail('delete sessions',      'DELETE FROM public.sessions',                '42501');
SELECT t.expect_fail('truncate responses',   'TRUNCATE public.responses',                  '42501');
SELECT t.expect_fail('read keepalive',       'SELECT * FROM public.keepalive',             '42501');
SELECT t.expect_fail('insert keepalive',     'INSERT INTO public.keepalive DEFAULT VALUES','42501');
SELECT t.expect_fail('call trigger function directly',
  'SELECT public.responses_match_order()', '42501');

RESET ROLE;

-- ---------------- the owner sees exactly what was accepted -------------
DO $$
DECLARE n_sess int; n_scr int; n_resp int; n_auth int;
BEGIN
  SELECT count(*) INTO n_sess FROM public.sessions;
  SELECT count(*) INTO n_scr  FROM public.screening;
  SELECT count(*) INTO n_resp FROM public.responses;
  SELECT count(*) INTO n_auth
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('sessions', 'screening', 'responses', 'keepalive')
     AND grantee IN ('anon', 'authenticated')
     AND privilege_type <> 'INSERT';
  IF (n_sess, n_scr, n_resp, n_auth) <> (2, 2, 23, 0) THEN
    RAISE EXCEPTION 'FAIL: expected (2,2,23,0), got (%,%,%,%)', n_sess, n_scr, n_resp, n_auth;
  END IF;
  RAISE NOTICE 'ok   owner counts: 2 sessions, 2 screenings, 23 responses; no non-INSERT grant to anon or authenticated';
  RAISE NOTICE 'ALL TESTS PASSED';
END $$;

\connect postgres
DROP DATABASE survey_schema_test;
