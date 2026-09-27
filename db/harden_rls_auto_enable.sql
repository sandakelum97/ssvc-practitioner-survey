-- =====================================================================
-- db/harden_rls_auto_enable.sql — run once on ssvc-survey.
--
-- public.rls_auto_enable() is not part of the survey schema. Supabase
-- created it, with the event trigger ensure_rls, because the project was
-- created with "automatically enable RLS on new tables" switched on. It
-- was created with PostgreSQL's default EXECUTE for PUBLIC, so the API
-- roles can call it: Security Advisor warnings 1 and 2 of 27 Sep 2026.
--
-- This removes that right from PUBLIC, anon and authenticated. The event
-- trigger keeps working: PostgreSQL does not check EXECUTE when it runs
-- an event-trigger function. Does nothing if the function is absent.
-- =====================================================================

DO $$
BEGIN
    IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
    END IF;
END $$;
