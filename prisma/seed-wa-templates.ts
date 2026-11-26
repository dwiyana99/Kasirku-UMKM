/**
 * KasirAkun UMKM — Seed Script for Default Custom WhatsApp Message Templates
 * Run with: npx tsx prisma/seed-wa-templates.ts (requires DATABASE_URL configured)
 */

import { DEFAULT_WA_MESSAGE_TEMPLATES } from '../src/lib/payments/wa-templates.ts';

export async function seedWaTemplatesWithPrisma(prismaClient: {
  waMessageTemplate: {
    upsert: (args: {
      where: { code: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }) => Promise<unknown>;
  };
}): Promise<number> {
  let count = 0;
  for (const tpl of DEFAULT_WA_MESSAGE_TEMPLATES) {
    await prismaClient.waMessageTemplate.upsert({
      where: { code: tpl.code },
      update: {
        title: tpl.title,
        category: tpl.category,
        bodyTemplate: tpl.bodyTemplate,
        isActive: tpl.isActive,
      },
      create: {
        code: tpl.code,
        title: tpl.title,
        category: tpl.category,
        bodyTemplate: tpl.bodyTemplate,
        isActive: tpl.isActive,
        updatedByAdminId: 'system-seed',
      },
    });
    count += 1;
  }
  return count;
}

if (typeof process !== 'undefined' && process.argv[1]?.includes('seed-wa-templates')) {
  console.log(
    `[seed-wa-templates] ${DEFAULT_WA_MESSAGE_TEMPLATES.length} template WA default siap di-seed ke PostgreSQL (jalankan bersama PrismaClient).`
  );
}
