import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@quant.app' },
    update: {},
    create: {
      email: 'admin@quant.app',
      username: 'admin',
      displayName: 'System Admin',
      passwordHash: '$2a$12$placeholder_hash_for_seeding',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  // Create test users
  const user1 = await prisma.user.upsert({
    where: { email: 'alice@quant.app' },
    update: {},
    create: {
      email: 'alice@quant.app',
      username: 'alice',
      displayName: 'Alice Smith',
      passwordHash: '$2a$12$placeholder_hash_for_seeding',
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'bob@quant.app' },
    update: {},
    create: {
      email: 'bob@quant.app',
      username: 'bob',
      displayName: 'Bob Johnson',
      passwordHash: '$2a$12$placeholder_hash_for_seeding',
      role: 'USER',
      status: 'ACTIVE',
      emailVerified: true,
    },
  });

  // Create AI session
  await prisma.aISession.create({
    data: {
      userId: user1.id,
      title: 'Welcome Chat',
      model: 'gpt-4o',
      messages: {
        create: [
          { role: 'USER', content: 'Hello! What can you help me with?' },
          {
            role: 'ASSISTANT',
            content: 'I can help with email, chat, content creation, and more!',
          },
        ],
      },
    },
  });

  console.log('Seeding complete!');
  console.log({ admin: admin.id, user1: user1.id, user2: user2.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
