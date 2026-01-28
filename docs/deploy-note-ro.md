# Notite deploy (RO)

## Unde se face deploy
- Supabase Edge Functions: proiectul Supabase este `muswtkzjfrldhgokkmqw` (referinta proiect).
- Frontend: deploy pe Vercel, declansat automat de push pe `main` in repo-ul Git.

## Comenzi utile
- Deploy o functie Supabase: `supabase functions deploy <nume_functie> --project-ref muswtkzjfrldhgokkmqw`
- Deploy manual Vercel (daca e nevoie): `vercel --prod`

## Repo si branch
- Repo: `origin` (GitHub) cu deploy pe `main`
- Branch standard: `main`

## Configuri/Env
- URL Supabase si chei: vezi `.env` / `.env.local` / `.env.example`
- Supabase local config: `supabase/config.toml`
