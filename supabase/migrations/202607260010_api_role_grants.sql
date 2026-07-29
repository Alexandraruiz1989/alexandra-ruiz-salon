BEGIN;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA public
TO authenticated, service_role;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA public
TO authenticated, service_role;

GRANT EXECUTE
ON ALL FUNCTIONS IN SCHEMA public
TO authenticated, service_role;

COMMIT;
