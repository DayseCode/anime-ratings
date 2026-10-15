# Anime OP / ED / Insert Ratings

React (Vite) website + Supabase (database, login) + Vercel (hosting).

## 0. Install once on your computer
1. **Node.js** (LTS, v20.6 or newer): https://nodejs.org
2. **VS Code**: https://code.visualstudio.com  (open this folder with *File -> Open Folder*)
3. **Git**: https://git-scm.com  and a free **GitHub** account

Check in the VS Code terminal (*Terminal -> New Terminal*):
```
node -v
git --version
```

## 1. Supabase (database)
1. https://supabase.com -> New project (remember the database password, pick a region near you).
2. **SQL Editor -> New query**, paste all of `supabase/schema.sql`, press **Run**.
3. **Authentication -> Sign In / Providers -> Email -> turn OFF "Confirm email"**
   (otherwise friends must click an email link, and the free built-in mailer is limited to a few emails per hour).
4. **Project Settings -> API** (or "API Keys"). Copy:
   - Project URL
   - `anon` / **publishable** key  -> goes to the website
   - `service_role` / **secret** key -> only for the import in step 3, keep it private

## 2. Configure the project
In VS Code terminal, inside this folder:
```
npm install
```
Copy `.env.example` to `.env.local` and fill in the 4 values.

## 3. Import your data (one time)
```
npm run import
```
It uploads 16 columns (people), 962 OPs, 240 EDs, 38 Inserts and ~8,300 scores.
(`scripts/seed.json` was generated from your Excel file.)

## 4. Run locally
```
npm run dev
```
Open http://localhost:5173

## 5. Create the first admin
1. On the site click **Log in / Sign up** and create YOUR account.
2. Supabase -> **SQL Editor**:
```sql
update public.profiles set is_admin = true where email = 'your@email.com';
```
3. Refresh the site: the **Admin panel** button appears.
4. Admin panel -> **Users** -> link your account to your rating column (e.g. "Віталя").
   Do the same for each friend after they sign up.

## 6. Publish
1. Create a GitHub repo, then in the terminal:
```
git init
git add .
git commit -m "first version"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/anime-ratings.git
git push -u origin main
```
2. https://vercel.com -> Add New -> Project -> import the repo (Framework: Vite, auto-detected).
3. Before pressing Deploy, add Environment Variables:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (only these two!).
4. Deploy. Every `git push` redeploys automatically.
5. Supabase -> Authentication -> URL Configuration -> set **Site URL** to your Vercel address.

## How permissions work (enforced in the database, not just the UI)
- Everyone can read. Songs/columns can be changed only by admins.
- A normal user can write scores only into the column linked to their account.
- Admins can write any cell, add/remove songs, link accounts and make other admins.
- Sorting is local to each visitor and is never saved.
