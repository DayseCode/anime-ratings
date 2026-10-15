// One-time import of your Google Sheets / Excel data into Supabase.
// Run with:  npm run import
// Needs SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local  (see README)

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local')
  process.exit(1)
}

// The secret (service_role) key bypasses Row Level Security. Never put it in the website!
const db = createClient(url, key, { auth: { persistSession: false } })
const seed = JSON.parse(readFileSync(new URL('./seed.json', import.meta.url), 'utf8'))

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))
const fail = (what, error) => { console.error(`\n✖ ${what}:`, error.message); process.exit(1) }

// Safety: don't import twice by accident
const { count, error: cErr } = await db.from('songs').select('*', { count: 'exact', head: true })
if (cErr) fail('Cannot reach the database (did you run schema.sql?)', cErr)
if (count > 0 && !process.argv.includes('--force')) {
  console.error(`The songs table already has ${count} rows. Aborting. (Use --force to import anyway.)`)
  process.exit(1)
}

// 1) raters (the 16 columns)
console.log('Importing raters...')
const { data: raters, error: rErr } = await db
  .from('raters')
  .upsert(seed.raters.map((name, i) => ({ name, position: i })), { onConflict: 'name' })
  .select('id,name')
if (rErr) fail('raters', rErr)
const raterId = Object.fromEntries(raters.map((r) => [r.name, r.id]))

// 2) songs
console.log(`Importing ${seed.songs.length} songs...`)
const keyOf = (s) => [s.kind, s.title, s.song ?? ''].join('||')
const scoresByKey = new Map(seed.songs.map((s) => [keyOf(s), s.scores]))
const idByKey = new Map()
for (const part of chunk(seed.songs, 300)) {
  const rows = part.map(({ scores, ...song }) => song)
  const { data, error } = await db.from('songs').insert(rows).select('id,kind,title,song')
  if (error) fail('songs', error)
  data.forEach((d) => idByKey.set(keyOf(d), d.id))
  process.stdout.write('.')
}

// 3) scores
const scoreRows = []
for (const [k, scores] of scoresByKey) {
  const song_id = idByKey.get(k)
  for (const [raterIdx, score] of scores) {
    scoreRows.push({ song_id, rater_id: raterId[seed.raters[raterIdx]], score })
  }
}
console.log(`\nImporting ${scoreRows.length} scores...`)
for (const part of chunk(scoreRows, 1000)) {
  const { error } = await db.from('scores').insert(part)
  if (error) fail('scores', error)
  process.stdout.write('.')
}
console.log('\n✔ Done!')
