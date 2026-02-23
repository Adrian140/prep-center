#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createClient } from '@supabase/supabase-js';

function parseArgs(argv) {
  const out = { files: [], source: 'geonames' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--file') out.files.push(String(argv[++i] || '').trim());
    else if (arg === '--source') out.source = String(argv[++i] || '').trim() || 'geonames';
  }
  return out;
}

function normalize(value) {
  return String(value || '').trim();
}

function dedupeKey(row) {
  return `${row.country_code}|${row.postal_code}|${row.city}`;
}

async function parseGeoNamesFile(filePath, source) {
  const rows = [];
  const seen = new Set();
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const raw = String(line || '');
    if (!raw || raw.startsWith('#')) continue;
    const cols = raw.split('\t');
    if (cols.length < 3) continue;

    const countryCode = normalize(cols[0]).toUpperCase();
    const postalCode = normalize(cols[1]);
    const city = normalize(cols[2]);
    const stateCode = normalize(cols[4] || cols[3] || '');

    if (!countryCode || !postalCode || !city) continue;
    const row = {
      country_code: countryCode,
      postal_code: postalCode,
      city,
      state_code: stateCode || null,
      is_serviceable: true,
      source
    };
    const key = dedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

async function upsertRows(supabase, rows, batchSize = 1000) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('ups_postal_codes')
      .upsert(chunk, { onConflict: 'country_code,postal_code,city' });
    if (error) throw error;
    inserted += chunk.length;
    process.stdout.write(`\rUpserted ${inserted}/${rows.length}`);
  }
  process.stdout.write('\n');
}

async function main() {
  const { files, source } = parseArgs(process.argv);
  if (!files.length) {
    console.error('Usage: node tools/ups/importUpsPostalCodes.mjs --file /path/FR.txt [--file /path/DE.txt] [--source geonames]');
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let allRows = [];
  for (const file of files) {
    const fullPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(fullPath)) {
      console.error(`File not found: ${fullPath}`);
      process.exit(1);
    }
    console.log(`Parsing ${fullPath}...`);
    const rows = await parseGeoNamesFile(fullPath, source);
    console.log(`Parsed ${rows.length} rows`);
    allRows = allRows.concat(rows);
  }

  const dedup = new Map();
  allRows.forEach((row) => dedup.set(dedupeKey(row), row));
  const rows = Array.from(dedup.values());
  console.log(`Total unique rows: ${rows.length}`);
  if (!rows.length) {
    console.log('No rows to import.');
    return;
  }

  await upsertRows(supabase, rows);
  console.log('Import completed.');
}

main().catch((error) => {
  console.error('Import failed:', error?.message || error);
  process.exit(1);
});
