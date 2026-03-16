#!/usr/bin/env node
/**
 * Import Payhip "Customer List" CSV exports into the D1 `purchases` table.
 *
 * Goals:
 * - Only use data that exists in the CSV headers (no invented columns).
 * - Avoid overwriting existing fields with NULL when the CSV doesn't include that header.
 * - Mark imported rows as `webhook_sent = 1` on INSERT to avoid retroactive spam.
 *
 * Usage:
 *   node scripts/import_purchases_csv.mjs --csv ../../Customer_List.csv --db evo_support --remote
 *   node scripts/import_purchases_csv.mjs --csv ./file.csv --db evo_support --remote --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const args = { remote: false, dryRun: false, csv: '', db: '', limit: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--remote') args.remote = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--csv') args.csv = argv[++i] || '';
    else if (a === '--db') args.db = argv[++i] || '';
    else if (a === '--limit') args.limit = Number(argv[++i] || 0) || 0;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function parseCsv(text) {
  // Minimal RFC4180-style parser: commas, quotes, CRLF/LF, and "" inside quoted fields.
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      // Handle CRLF and LF
      if (ch === '\r' && text[i + 1] === '\n') i += 2;
      else i += 1;
      row.push(field);
      field = '';
      // Avoid pushing trailing empty line
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
      row = [];
      continue;
    }

    field += ch;
    i += 1;
  }

  row.push(field);
  if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
  return rows;
}

function toIsoDate(dateValue) {
  const raw = String(dateValue || '').trim();
  if (!raw) return null;
  // Payhip export often gives YYYY-MM-DD (no time).
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00.000Z`;
  // If it's already ISO-ish, keep as-is.
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;
  // Fallback: let JS parse; if invalid, return raw as last resort.
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString();
}

function extractDiscordIdFromCheckoutResponses(value) {
  const raw = String(value || '');
  const m = raw.match(/discord\s*id\s*:\s*"?(\d{5,30})"?/i);
  return m ? m[1] : null;
}

function sqlEscape(value) {
  if (value === null || value === undefined) return 'NULL';
  const str = String(value);
  // SQLite string literal escaping uses '' for a single quote.
  return `'${str.replace(/'/g, "''")}'`;
}

function buildUpsertSql({ columns, rows, updateColumns }) {
  const cols = columns.join(', ');
  const values = rows
    .map((r) => `(${columns.map((c) => sqlEscape(r[c])).join(', ')})`)
    .join(',\n');

  if (!updateColumns.length) {
    return `INSERT INTO purchases (${cols}) VALUES\n${values}\nON CONFLICT(transaction_id) DO NOTHING;`;
  }

  const setClause = updateColumns
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');

  return `INSERT INTO purchases (${cols}) VALUES\n${values}\nON CONFLICT(transaction_id) DO UPDATE SET ${setClause};`;
}

function runWranglerExecute({ db, remote, sql }) {
  const args = ['wrangler', 'd1', 'execute', db];
  if (remote) args.push('--remote');
  args.push('--command', sql);

  const res = spawnSync('npx', args, { stdio: 'inherit' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`wrangler exited with status ${res.status}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.csv || !args.db) {
    console.log(
      [
        'Usage:',
        '  node scripts/import_purchases_csv.mjs --csv <file.csv> --db <d1_name> [--remote] [--dry-run] [--limit N]',
        '',
        'Example:',
        '  node scripts/import_purchases_csv.mjs --csv ../../Customer_List.csv --db evo_support --remote',
      ].join('\n')
    );
    process.exit(args.help ? 0 : 2);
  }

  const csvPath = path.resolve(process.cwd(), args.csv);
  const text = fs.readFileSync(csvPath, 'utf8');
  const parsed = parseCsv(text);
  if (parsed.length < 2) {
    console.error('CSV has no rows to import.');
    process.exit(1);
  }

  const rawHeaders = parsed[0];
  const headerKeys = rawHeaders.map(normalizeHeader);

  // Map known Payhip-export headers to our DB columns.
  const headerToColumn = new Map();
  for (let i = 0; i < headerKeys.length; i++) {
    const hk = headerKeys[i];
    if (hk === 'order_id') headerToColumn.set(i, 'transaction_id');
    else if (hk === 'email') headerToColumn.set(i, 'email');
    else if (hk === 'currency') headerToColumn.set(i, 'currency');
    else if (hk === 'amount_gross') headerToColumn.set(i, 'amount_gross');
    else if (hk === 'amount_net') headerToColumn.set(i, 'amount_net');
    else if (hk === 'status') headerToColumn.set(i, 'status');
    else if (hk === 'items_in_cart') headerToColumn.set(i, 'items_in_cart');
    else if (hk === 'coupon_discount_amount') headerToColumn.set(i, 'coupon_discount_amount');
    else if (hk === 'date') headerToColumn.set(i, 'created_at');
    else if (hk === 'checkout_responses') headerToColumn.set(i, '__checkout_responses');
    else if (hk === 'discord_id') headerToColumn.set(i, 'discord_id');
  }

  const importableColumns = new Set(
    [...headerToColumn.values()].filter((v) => !v.startsWith('__'))
  );
  // If we have checkout responses, we can extract discord_id from it; treat it as importable.
  if (headerKeys.includes('checkout_responses')) {
    importableColumns.add('discord_id');
  }

  // We always need a transaction_id and we always set webhook_sent=1 for imported rows.
  const insertColumns = ['transaction_id', ...[...importableColumns].filter((c) => c !== 'transaction_id'), 'webhook_sent'];

  // Only update columns that were present in CSV headers; never update webhook_sent.
  const updateColumns = [...importableColumns].filter((c) => c !== 'transaction_id');

  const rows = [];
  for (let ri = 1; ri < parsed.length; ri++) {
    const row = parsed[ri];
    if (!row || row.every((v) => !String(v || '').trim())) continue;

    const out = {};
    let checkoutResponses = '';

    for (let ci = 0; ci < headerKeys.length; ci++) {
      const col = headerToColumn.get(ci);
      if (!col) continue;
      const value = row[ci] ?? '';
      if (col === '__checkout_responses') {
        checkoutResponses = String(value || '');
        continue;
      }
      if (col === 'created_at') out.created_at = toIsoDate(value);
      else out[col] = String(value || '').trim() || null;
    }

    const transactionId = out.transaction_id || null;
    if (!transactionId) continue;

    if (!out.discord_id && checkoutResponses) {
      out.discord_id = extractDiscordIdFromCheckoutResponses(checkoutResponses);
    }

    // Always mark imported entries as "webhook already sent" to avoid retro spam.
    out.webhook_sent = 1;

    rows.push(out);
    if (args.limit && rows.length >= args.limit) break;
  }

  if (!rows.length) {
    console.error('No importable rows found (did you have Order ID values?).');
    process.exit(1);
  }

  const chunkSize = 150;
  const chunks = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    chunks.push(rows.slice(i, i + chunkSize));
  }

  console.log(
    `[import] Parsed ${rows.length} rows from ${path.basename(csvPath)}. ` +
      `Will execute ${chunks.length} SQL chunk(s).`
  );
  console.log(`[import] Insert columns: ${insertColumns.join(', ')}`);
  console.log(`[import] Update columns: ${updateColumns.join(', ') || '(none)'}`);

  if (args.dryRun) {
    const sample = chunks[0].slice(0, 2);
    const sql = buildUpsertSql({
      columns: insertColumns,
      rows: sample,
      updateColumns,
    });
    console.log('\n[dry-run] Sample SQL (first 2 rows):\n');
    console.log(sql);
    return;
  }

  for (let ci = 0; ci < chunks.length; ci++) {
    const sql = buildUpsertSql({
      columns: insertColumns,
      rows: chunks[ci],
      updateColumns,
    });
    console.log(`[import] Executing chunk ${ci + 1}/${chunks.length}...`);
    runWranglerExecute({ db: args.db, remote: args.remote, sql });
  }

  console.log('[import] Done.');
}

main();
