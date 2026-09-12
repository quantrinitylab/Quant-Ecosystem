import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

if (process.env['NODE_ENV'] === 'production') {
  throw new Error('Refusing to seed in production. This script is for local development only.');
}

const prisma = new PrismaClient();

// Deterministic demo users for local development
const DEMO_USERS = [
  {
    email: 'personal@quant.dev',
    username: 'personal_user',
    displayName: 'Alex Personal',
    role: 'USER' as const,
    bio: 'A regular user exploring the Quant ecosystem.',
  },
  {
    email: 'admin@quant.dev',
    username: 'admin_user',
    displayName: 'Admin Thompson',
    role: 'ADMIN' as const,
    bio: 'Team administrator managing the workspace.',
  },
  {
    email: 'creator@quant.dev',
    username: 'creator_user',
    displayName: 'Casey Creator',
    role: 'USER' as const,
    bio: 'Content creator and video producer.',
  },
  {
    email: 'advertiser@quant.dev',
    username: 'advertiser_user',
    displayName: 'Morgan Advertiser',
    role: 'USER' as const,
    bio: 'Digital marketing specialist running campaigns.',
  },
  {
    email: 'moderator@quant.dev',
    username: 'moderator_user',
    displayName: 'Sam Moderator',
    role: 'USER' as const,
    bio: 'Community moderator keeping things safe.',
  },
  {
    email: 'developer@quant.dev',
    username: 'developer_user',
    displayName: 'Dev Johnson',
    role: 'USER' as const,
    bio: 'Platform developer and API tester.',
  },
];

async function seedDemoUsers() {
  globalThis.console.log('Creating demo users...');
  const demoUserRecords = [];

  for (const demoUser of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      update: {},
      create: {
        email: demoUser.email,
        username: demoUser.username,
        displayName: demoUser.displayName,
        passwordHash: 'demo-password-hash-not-for-production',
        avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(demoUser.displayName)}`,
        bio: demoUser.bio,
        role: demoUser.role,
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    demoUserRecords.push(user);
  }

  globalThis.console.log(`Created ${demoUserRecords.length} demo users`);
  return demoUserRecords;
}

async function seedDemoData(demoUsers: Awaited<ReturnType<typeof seedDemoUsers>>) {
  globalThis.console.log('Creating demo data for demo users...');

  // Create 10 emails per demo user
  for (const user of demoUsers) {
    for (let i = 0; i < 10; i++) {
      await prisma.email.create({
        data: {
          userId: user.id,
          fromAddress: faker.internet.email(),
          fromName: faker.person.fullName(),
          toAddresses: JSON.stringify([user.email]),
          subject: faker.lorem.sentence(),
          bodyPlain: faker.lorem.paragraphs(2),
          snippet: faker.lorem.sentence(),
          isRead: i < 5,
          receivedAt: faker.date.recent({ days: 14 }),
        },
      });
    }
  }
  globalThis.console.log('Created 60 demo emails (10 per user)');

  // Create 5 chat conversations among demo users
  for (let i = 0; i < 5; i++) {
    const creator = demoUsers[i % demoUsers.length]!;
    const participant = demoUsers[(i + 1) % demoUsers.length]!;

    const conversation = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        createdBy: creator.id,
        lastMessageAt: new Date(),
        members: {
          create: [
            { userId: creator.id, role: 'OWNER' },
            { userId: participant.id, role: 'MEMBER' },
          ],
        },
      },
    });

    for (let j = 0; j < 8; j++) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: j % 2 === 0 ? creator.id : participant.id,
          type: 'TEXT',
          content: faker.lorem.sentence(),
        },
      });
    }
  }
  globalThis.console.log('Created 5 demo conversations');

  // Create 10 posts from demo users
  for (let i = 0; i < 10; i++) {
    const user = demoUsers[i % demoUsers.length]!;
    await prisma.post.create({
      data: {
        userId: user.id,
        type: 'TEXT',
        content: faker.lorem.paragraph(),
        visibility: 'PUBLIC',
        moderationStatus: 'APPROVED',
        publishedAt: faker.date.recent({ days: 30 }),
        likeCount: faker.number.int({ min: 5, max: 100 }),
        viewCount: faker.number.int({ min: 50, max: 1000 }),
      },
    });
  }
  globalThis.console.log('Created 10 demo posts');

  // Create 10 notifications per demo user
  for (const user of demoUsers) {
    for (let i = 0; i < 10; i++) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: faker.helpers.arrayElement(['like', 'comment', 'follow', 'mention', 'message']),
          title: faker.lorem.words(3),
          body: faker.lorem.sentence(),
          isRead: i < 5,
          sourceApp: faker.helpers.arrayElement([
            'quantwave',
            'quantchat',
            'quantube',
            'quantmail',
            'quantgram',
          ]),
        },
      });
    }
  }
  globalThis.console.log('Created 60 demo notifications (10 per user)');
}

async function main() {
  globalThis.console.log('Seeding database...');

  // Step 1: Create deterministic demo users
  const demoUsers = await seedDemoUsers();

  // Step 2: Create demo data for demo users
  await seedDemoData(demoUsers);

  // Step 3: Create random users
  const users = [...demoUsers];
  for (let i = 0; i < 50; i++) {
    const user = await prisma.user.create({
      data: {
        email: faker.internet.email(),
        username: faker.internet.username() + i,
        displayName: faker.person.fullName(),
        passwordHash: faker.string.alphanumeric(64),
        avatarUrl: faker.image.avatar(),
        bio: faker.lorem.sentence(),
        website: faker.internet.url(),
        location: faker.location.city(),
        dateOfBirth: faker.date.birthdate(),
        role: 'USER',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    users.push(user);
  }
  globalThis.console.log(`Created ${users.length - demoUsers.length} random users`);

  // Create 20 conversations with messages
  for (let i = 0; i < 20; i++) {
    const creator = faker.helpers.arrayElement(users);
    const participant = faker.helpers.arrayElement(users.filter((u) => u.id !== creator.id));

    const conversation = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        createdBy: creator.id,
        lastMessageAt: new Date(),
        members: {
          create: [
            { userId: creator.id, role: 'OWNER' },
            { userId: participant.id, role: 'MEMBER' },
          ],
        },
      },
    });

    // Add 5-10 messages per conversation
    const messageCount = faker.number.int({ min: 5, max: 10 });
    for (let j = 0; j < messageCount; j++) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: faker.helpers.arrayElement([creator.id, participant.id]),
          type: 'TEXT',
          content: faker.lorem.sentence(),
        },
      });
    }
  }
  globalThis.console.log('Created 20 conversations with messages');

  // Create 100 emails
  for (let i = 0; i < 100; i++) {
    const user = faker.helpers.arrayElement(users);
    await prisma.email.create({
      data: {
        userId: user.id,
        fromAddress: faker.internet.email(),
        fromName: faker.person.fullName(),
        toAddresses: JSON.stringify([user.email]),
        subject: faker.lorem.sentence(),
        bodyPlain: faker.lorem.paragraphs(2),
        snippet: faker.lorem.sentence(),
        isRead: faker.datatype.boolean(),
        receivedAt: faker.date.recent({ days: 30 }),
      },
    });
  }
  globalThis.console.log('Created 100 emails');

  // Create 200 posts with comments
  for (let i = 0; i < 200; i++) {
    const user = faker.helpers.arrayElement(users);
    const post = await prisma.post.create({
      data: {
        userId: user.id,
        type: faker.helpers.arrayElement(['TEXT', 'IMAGE', 'LINK']),
        content: faker.lorem.paragraph(),
        visibility: 'PUBLIC',
        moderationStatus: 'APPROVED',
        publishedAt: faker.date.recent({ days: 60 }),
        likeCount: faker.number.int({ min: 0, max: 500 }),
        viewCount: faker.number.int({ min: 0, max: 5000 }),
      },
    });

    // Add 0-3 comments per post
    const commentCount = faker.number.int({ min: 0, max: 3 });
    for (let j = 0; j < commentCount; j++) {
      await prisma.comment.create({
        data: {
          postId: post.id,
          userId: faker.helpers.arrayElement(users).id,
          content: faker.lorem.sentence(),
        },
      });
    }
  }
  globalThis.console.log('Created 200 posts with comments');

  // Create 10 campaigns
  for (let i = 0; i < 10; i++) {
    const advertiser = faker.helpers.arrayElement(users);
    await prisma.campaign.create({
      data: {
        advertiserId: advertiser.id,
        name: faker.company.catchPhrase(),
        objective: faker.helpers.arrayElement(['AWARENESS', 'TRAFFIC', 'ENGAGEMENT']),
        status: faker.helpers.arrayElement(['DRAFT', 'ACTIVE', 'PAUSED']),
        budget: JSON.stringify({
          daily: faker.number.float({ min: 10, max: 1000, fractionDigits: 2 }),
          total: faker.number.float({ min: 100, max: 10000, fractionDigits: 2 }),
        }),
        totalSpend: faker.number.float({ min: 0, max: 5000, fractionDigits: 2 }),
        totalImpressions: faker.number.int({ min: 0, max: 100000 }),
        totalClicks: faker.number.int({ min: 0, max: 5000 }),
      },
    });
  }
  globalThis.console.log('Created 10 campaigns');

  // Create 50 videos
  for (let i = 0; i < 50; i++) {
    const user = faker.helpers.arrayElement(users);
    await prisma.video.create({
      data: {
        userId: user.id,
        title: faker.lorem.sentence(),
        description: faker.lorem.paragraph(),
        videoUrl: faker.internet.url(),
        thumbnailUrl: faker.image.url(),
        duration: faker.number.int({ min: 30, max: 3600 }),
        width: 1920,
        height: 1080,
        fileSize: BigInt(faker.number.int({ min: 1000000, max: 500000000 })),
        category: faker.helpers.arrayElement(['Education', 'Entertainment', 'Music', 'Gaming']),
        visibility: 'PUBLIC',
        processingStatus: 'COMPLETED',
        publishedAt: faker.date.recent({ days: 90 }),
        viewCount: faker.number.int({ min: 0, max: 100000 }),
        likeCount: faker.number.int({ min: 0, max: 5000 }),
      },
    });
  }
  globalThis.console.log('Created 50 videos');

  // Create 100 photos
  for (let i = 0; i < 100; i++) {
    const user = faker.helpers.arrayElement(users);
    await prisma.photo.create({
      data: {
        userId: user.id,
        caption: faker.lorem.sentence(),
        imageUrl: faker.image.url(),
        thumbnailUrl: faker.image.url(),
        width: faker.number.int({ min: 800, max: 4000 }),
        height: faker.number.int({ min: 600, max: 3000 }),
        fileSize: faker.number.int({ min: 100000, max: 10000000 }),
        likeCount: faker.number.int({ min: 0, max: 1000 }),
      },
    });
  }
  globalThis.console.log('Created 100 photos');

  // Create 30 stories
  for (let i = 0; i < 30; i++) {
    const user = faker.helpers.arrayElement(users);
    await prisma.story.create({
      data: {
        userId: user.id,
        type: faker.helpers.arrayElement(['IMAGE', 'VIDEO', 'TEXT']),
        mediaUrl: faker.image.url(),
        duration: faker.number.int({ min: 5, max: 30 }),
        expiresAt: faker.date.soon({ days: 1 }),
      },
    });
  }
  globalThis.console.log('Created 30 stories');

  // Create 20 AI sessions with messages
  for (let i = 0; i < 20; i++) {
    const user = faker.helpers.arrayElement(users);
    const session = await prisma.aISession.create({
      data: {
        userId: user.id,
        title: faker.lorem.sentence(),
        model: faker.helpers.arrayElement(['gpt-4', 'gpt-3.5-turbo', 'claude-3']),
      },
    });

    // Add 4-8 messages per session
    const msgCount = faker.number.int({ min: 4, max: 8 });
    for (let j = 0; j < msgCount; j++) {
      await prisma.aIMessage.create({
        data: {
          sessionId: session.id,
          role: j % 2 === 0 ? 'USER' : 'ASSISTANT',
          content: faker.lorem.paragraph(),
          tokenCount: faker.number.int({ min: 10, max: 500 }),
        },
      });
    }
  }
  globalThis.console.log('Created 20 AI sessions with messages');

  // Create notifications
  for (let i = 0; i < 100; i++) {
    const user = faker.helpers.arrayElement(users);
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: faker.helpers.arrayElement(['like', 'comment', 'follow', 'mention', 'message']),
        title: faker.lorem.words(3),
        body: faker.lorem.sentence(),
        isRead: faker.datatype.boolean(),
        sourceApp: faker.helpers.arrayElement([
          'quantwave',
          'quantchat',
          'quantube',
          'quantmail',
          'quantgram',
        ]),
      },
    });
  }
  globalThis.console.log('Created 100 notifications');

  globalThis.console.log('Seeding complete!');
}

main()
  .catch((e) => {
    globalThis.console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
