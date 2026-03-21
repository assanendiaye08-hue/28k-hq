import path from 'node:path';
import { defineConfig } from '@prisma/config';

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/discord_hustler',
  },
  migrations: {
    path: path.join(import.meta.dirname, 'prisma', 'migrations'),
  },
});
