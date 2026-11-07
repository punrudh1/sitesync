-- Allow authenticated users to update only their own appearance preferences.
-- Row-level security still restricts updates to the user's own profile row.
grant update (theme_preference, accent_preference) on public.profiles to authenticated;
