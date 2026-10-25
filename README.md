# epstein-files

Gamified data labelling — audio and images. Fork of ASMRboard (`~/vscode/text2asmr/frontend`).

Label data, move up the Epstein waitlist, top 10 make it to the island. Five in a row keeps the pace, 20 labels completes the day, consensus (12–20 labellers) and IoU keep it honest — junk labellers get banned.

Full build spec: [docs/SPEC.md](docs/SPEC.md) · House style: [docs/STYLE.md](docs/STYLE.md) · Supabase backend: [docs/BACKEND.md](docs/BACKEND.md) · Genuine-vs-fake labeller detection: [docs/INTEGRITY.md](docs/INTEGRITY.md)

Style, backend patterns, and integrity mechanics are lifted from ASMRboard (`~/vscode/text2asmr`); Supabase project + keys will be set up by Alosh on request.

## Local development

Needs Node 22, Docker and the Supabase CLI.

```sh
cd backend && supabase start && supabase test db        # migrations + 80 pgTAP assertions
cd ../frontend && npm install
cp .env.example .env.local                              # SUPABASE_ANON_KEY from `supabase status` (backend/)
SUPABASE_SERVICE_ROLE_KEY=<from supabase status> SUPABASE_ANON_KEY=<anon> node scripts/seed-local.mjs   # demo items + bot labellers
npm run dev                                             # http://localhost:5173, Supabase via the /sb proxy
```

The seed creates `admin@example.com` (password `labeller-demo-1`) with access to `/admin`. In a real project, make
someone an admin with the service role: `select public.admin_set_admin('username', true);`

Drop the homepage hero at `frontend/public/epstein-simpsons.jpeg`; until then the home page shows a folder placeholder.
