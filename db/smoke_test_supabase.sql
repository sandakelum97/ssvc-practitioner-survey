-- =====================================================================
-- db/smoke_test_supabase.sql — live check on ssvc-survey, BEFORE launch.
--
-- Acts as the public role (anon), exactly as the survey page will:
--   * it must NOT be able to read, update or delete anything;
--   * a complete valid rater (session, screening, 23 ratings) must be
--     accepted, and an undeclared value refused.
-- The valid raters are written inside a sub-transaction that is always
-- undone, so nothing is ever stored. The last step confirms the survey
-- tables are still empty.
--
-- Paste the whole file into the SQL editor and run it once.
-- Pass : "Success. No rows returned".
-- Fail : an error beginning "FAIL", naming the check.
-- Only meaningful while the survey tables are empty (before the pilot).
-- =====================================================================

DO $$
DECLARE
    sid   uuid       := gen_random_uuid();
    sid2  uuid       := gen_random_uuid();
    o     smallint[] := '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,2,6,12}';
    n     int;
BEGIN
    SET LOCAL ROLE anon;

    -- 1. The public role cannot read, change or delete.
    BEGIN PERFORM count(*) FROM public.responses;
          RAISE EXCEPTION 'FAIL: anon can read responses';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    BEGIN PERFORM count(*) FROM public.sessions;
          RAISE EXCEPTION 'FAIL: anon can read sessions';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    BEGIN PERFORM count(*) FROM public.screening;
          RAISE EXCEPTION 'FAIL: anon can read screening';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    BEGIN UPDATE public.responses SET confidence = 5;
          RAISE EXCEPTION 'FAIL: anon can update responses';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    BEGIN DELETE FROM public.responses;
          RAISE EXCEPTION 'FAIL: anon can delete responses';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    BEGIN PERFORM count(*) FROM public.keepalive;
          RAISE EXCEPTION 'FAIL: anon can read keepalive';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    -- 2. A complete valid rater is accepted; then everything is undone.
    BEGIN
        INSERT INTO public.sessions (session_id, survey_version, item_order, consent_given)
        VALUES (sid, 'v1', o, true);

        INSERT INTO public.screening (session_id, years_band, role_band, works_at_mssp, used_ssvc_before)
        VALUES (sid, '5_9', 'engineer', true, false);

        INSERT INTO public.responses (session_id, position, scenario, showing,
                                      system_exposure, human_impact, action, confidence)
        SELECT sid, i, o[i], CASE WHEN i > 20 THEN 2 ELSE 1 END,
               'controlled', 'medium', 'scheduled', 3
          FROM generate_series(1, 23) AS i;

        -- Undeclared values must be refused. A second real session is
        -- used so that no other rule can be the reason for the refusal.
        INSERT INTO public.sessions (session_id, survey_version, item_order, consent_given)
        VALUES (sid2, 'v1', o, true);

        BEGIN
            INSERT INTO public.screening (session_id, years_band, role_band, works_at_mssp, used_ssvc_before)
            VALUES (sid2, '2_4', 'other', true, false);
            RAISE EXCEPTION 'FAIL: role "other" was accepted';
        EXCEPTION WHEN check_violation THEN NULL; END;

        BEGIN
            INSERT INTO public.responses (session_id, position, scenario, showing,
                                          system_exposure, human_impact, action, confidence)
            VALUES (sid2, 1, 1, 1, 'open', 'low', 'track', 3);
            RAISE EXCEPTION 'FAIL: action "track" was accepted';
        EXCEPTION WHEN check_violation THEN NULL; END;

        -- Undo everything written above.
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'smoke-undo';
    EXCEPTION
        WHEN SQLSTATE 'P0001' THEN
            IF SQLERRM <> 'smoke-undo' THEN RAISE; END IF;
        WHEN OTHERS THEN
            RAISE EXCEPTION 'FAIL: a valid rater was refused: % (%)', SQLERRM, SQLSTATE;
    END;

    RESET ROLE;

    -- 3. Nothing was stored.
    SELECT (SELECT count(*) FROM public.sessions)
         + (SELECT count(*) FROM public.screening)
         + (SELECT count(*) FROM public.responses) INTO n;
    IF n <> 0 THEN
        RAISE EXCEPTION 'FAIL: % survey rows exist (expected 0 before the pilot)', n;
    END IF;
END $$;
