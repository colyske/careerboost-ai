alter table public.profiles
  add column career_data jsonb not null default '{"fullName":"","headline":"","summary":"","experiences":[],"education":[],"certifications":[],"achievements":[],"skills":[],"languages":[],"targetRoles":[],"evidenceGaps":[],"reviewNotes":[]}'::jsonb;

alter table public.profiles
  add constraint profiles_career_data_object check (jsonb_typeof(career_data) = 'object' and pg_column_size(career_data) <= 65536);

grant update (career_data) on public.profiles to authenticated;
