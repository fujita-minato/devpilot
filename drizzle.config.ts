import type { Config } from 'drizzle-kit';

const config: Config = {
  schema: './src/lib/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './devpilot.db',
  },
};

export default config;
