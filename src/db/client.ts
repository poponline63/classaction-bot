// Shared libSQL/SQLite handle. DATA_DIR is used for local and desktop file
// databases; hosted deployments can use DATABASE_URL plus DATABASE_AUTH_TOKEN
// or TURSO_AUTH_TOKEN.

import 'dotenv/config';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import path from 'node:path';
import fs from 'node:fs';
import * as schema from './schema';

// The desktop launcher sets DATA_DIR; dev mode falls back to ./data.
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_URL_RAW = process.env.DATABASE_URL ?? `file:${path.join(DATA_DIR, 'classaction.db')}`;

let dbUrl = DB_URL_RAW;
if (dbUrl.startsWith('file:')) {
  const rel = dbUrl.replace(/^file:/, '');
  const abs = path.isAbsolute(rel) ? rel : path.resolve(process.cwd(), rel);
  const dir = path.dirname(abs);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  dbUrl = `file:${abs}`;
}

const authToken = process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;
const client = createClient({ url: dbUrl, authToken });
export const db = drizzle(client, { schema });
export { schema };
export * from './schema';
