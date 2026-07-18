// Runs before every test file (vitest setupFiles): points Prisma at the
// dedicated rabbittrack_test database on the same Neon instance. Must run
// before anything imports "@/lib/prisma", which reads DATABASE_URL at
// module-import time.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const source = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL(_UNPOOLED) is not set — tests need .env.local");

const url = new URL(source);
url.pathname = "/rabbittrack_test";
process.env.DATABASE_URL = url.toString();

// Ambient farm for tests that call ops without an explicit runWithFarm wrap
// (the same fallback the web app's Server Components use — see tenant.ts).
// resetDb() creates this farm before every test.
process.env.DEFAULT_FARM_ID = "test_farm_00000000000001";
