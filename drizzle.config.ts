import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'turso',
  dbCredentials: {
    url: 'file:./data/classaction.db',
  },
  strict: true,
  verbose: true,
} satisfies Config;
