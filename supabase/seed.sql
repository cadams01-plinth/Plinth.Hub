-- Entry point for `supabase db reset`. Catalogue always; dev fixtures are
-- safe to include locally because they use fixed UUIDs + on conflict guards.
\ir seed/apps.sql
\ir seed/dev_fixtures.sql
