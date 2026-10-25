# dabel — all-in-one labelling

All-in-one labelling for audio and images. Host a public or private challenge, invite labellers, and review agreement and genuineness per queue.

Full build spec: [docs/SPEC.md](docs/SPEC.md) · House style: [docs/STYLE.md](docs/STYLE.md) · Supabase backend: [docs/BACKEND.md](docs/BACKEND.md) · Genuine-vs-fake labeller detection: [docs/INTEGRITY.md](docs/INTEGRITY.md)

Style, backend patterns, and integrity mechanics take cues from ASMRboard (`~/vscode/text2asmr`).

## Local development

Needs Node 22, Docker and the Supabase CLI.

```sh
cd backend && supabase start && supabase test db        # migrations + pgTAP assertions
cd ../frontend && npm install
cp .env.example .env.local                              # SUPABASE_ANON_KEY from `supabase status` (backend/)
SUPABASE_SERVICE_ROLE_KEY=<from supabase status> SUPABASE_ANON_KEY=<anon> node scripts/seed-local.mjs   # demo items + bot labellers
npm run dev                                             # http://localhost:5173, Supabase via the /sb proxy
```

The seed creates `admin@example.com` (password `labeller-demo-1`) with access to `/admin`. In a real project, make
someone an admin with the service role: `select public.admin_set_admin('username', true);`

Drop the homepage hero at `frontend/public/epstein-simpsons.jpeg`; until then the home page shows a folder placeholder.
