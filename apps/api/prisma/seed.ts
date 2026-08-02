import { PrismaClient } from '@prisma/client';

import { DEFAULT_CONFIGS } from '../src/modules/chat/seeds/default-configs';

const prisma = new PrismaClient();

async function main() {
  for (const config of DEFAULT_CONFIGS) {
    await prisma.chatConfig.upsert({
      where: { id: config.id },
      create: {
        id: config.id,
        systemPrompt: config.systemPrompt,
        roleName: config.roleName,
        aiModel: null,
        temperature: config.temperature,
        tags: config.tags,
      },
      update: {
        systemPrompt: config.systemPrompt,
        roleName: config.roleName,
        aiModel: null,
        temperature: config.temperature,
        tags: config.tags,
      },
    });
  }

  console.log(JSON.stringify({ chatConfigs: DEFAULT_CONFIGS.length }));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Seed failed');
    await prisma.$disconnect();
    process.exitCode = 1;
  });
