alter table public.profiles
  add column if not exists theme_preference text not null default 'dark'
    check (theme_preference in ('dark','light','system')),
  add column if not exists accent_preference text not null default 'orange'
    check (accent_preference in ('orange','blue','green','purple','pink'));
