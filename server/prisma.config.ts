import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed/index.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://oj:oj_dev_password@localhost:5432/online_judge',
  },
});
