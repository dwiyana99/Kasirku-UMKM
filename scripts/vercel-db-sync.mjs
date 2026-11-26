/**
 * Zero-Terminal Automatic Prisma Schema Push for Vercel + Neon PostgreSQL.
 * Runs automatically during `npm run build` ONLY when a real PostgreSQL DATABASE_URL
 * is configured (e.g., on Vercel deployments), creating all KasirAkun UMKM & Better Auth
 * tables in Neon without requiring any local terminal commands.
 * Never prints connection strings or secrets to build logs.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function isRealPostgresUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return false;
  if (
    url.includes('USER:PASSWORD') ||
    url.includes('YOUR_PASSWORD') ||
    url.includes('neondb_owner:PASSWORD@ep-xxx') ||
    url.includes('<PASSWORD>')
  ) {
    return false;
  }
  return url.startsWith('postgresql://') || url.startsWith('postgres://');
}

function main() {
  const hasDbUrl = isRealPostgresUrl(process.env.DATABASE_URL);
  if (!hasDbUrl) {
    console.log(
      '[vercel-db-sync] DATABASE_URL belum diisi — melewati sinkronisasi skema Neon (mode preview).'
    );
    return;
  }

  const effectiveDirectUrl = isRealPostgresUrl(process.env.DIRECT_URL)
    ? process.env.DIRECT_URL
    : isRealPostgresUrl(process.env.DATABASE_URL_UNPOOLED)
    ? process.env.DATABASE_URL_UNPOOLED
    : process.env.DATABASE_URL;

  console.log(
    '[vercel-db-sync] Neon PostgreSQL terdeteksi — menyinkronkan skema Prisma & tabel Better Auth otomatis...'
  );

  try {
    execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        DIRECT_URL: effectiveDirectUrl,
      },
    });
    console.log(
      '[vercel-db-sync] Selesai — seluruh tabel aplikasi & Better Auth siap di Neon PostgreSQL.'
    );
  } catch {
    console.error(
      '[vercel-db-sync] Gagal push skema ke Neon. Pastikan DATABASE_URL dan DIRECT_URL di Vercel valid dan memakai ?sslmode=require.'
    );
    process.exit(1);
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  main();
}
