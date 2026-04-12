// Shared SQLite handle. Uses @libsql/client (pure-JS/WASM) so it works on
// Windows without the Visual Studio build toolchain.
//
// DATA_DIR env var (set by the desktop launcher) overrides the default
// data directory. This lets the packaged exe store everything in
// %APPDATA%/classaction-bot/ while dev mode uses ./data/.

import 'dotenv/config';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import path from 'node:path';
import fs from 'node:fs';
import * as schema from './schema';

// Resolve the data directory — desktop launcher sets DATA_DIR, otherwise cwd.
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');

// Ensure data dir exists
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

const client = createClient({ url: dbUrl });
export const db = drizzle(client, { schema });
export { schema };
export * from './schema';
