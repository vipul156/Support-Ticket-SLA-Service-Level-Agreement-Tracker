import { PrismaClient, Priority } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Idempotent seed: users, holidays, and tickets across all four priorities.
 * Tickets use a fixed past creation date so their SLA states are stable and
 * interesting (breached / at-risk / met) for demo purposes.
 */
async function main(): Promise<void> {
  const reporter = await prisma.user.upsert({
    where: { email: 'reporter@example.com' },
    update: {},
    create: {
      name: 'Rita Reporter',
      email: 'reporter@example.com',
      passwordHash: await hash('password123', 10),
      role: 'REPORTER',
    },
  });

  const agent = await prisma.user.upsert({
    where: { email: 'agent@example.com' },
    update: {},
    create: {
      name: 'Alex Agent',
      email: 'agent@example.com',
      passwordHash: await hash('password123', 10),
      role: 'AGENT',
    },
  });

  await prisma.holiday.upsert({
    where: { date: '2026-08-15' },
    update: {},
    create: { date: '2026-08-15', name: 'Independence Day' },
  });
  await prisma.holiday.upsert({
    where: { date: '2026-12-25' },
    update: {},
    create: { date: '2026-12-25', name: 'Christmas Day' },
  });

  const existing = await prisma.ticket.count();
  if (existing === 0) {
    // A Monday 09:00 local (Asia/Kolkata) — inside business hours.
    // 2026-08-24 is a Monday.
    const monday = new Date('2026-08-24T03:30:00.000Z'); // 09:00 IST
    const friday = new Date('2026-08-21T11:30:00.000Z'); // 17:00 IST Friday

    await prisma.ticket.create({
      data: {
        title: 'Payment failed during checkout',
        description: 'Card was charged but the order shows failed. Happens on Safari only.',
        priority: Priority.URGENT,
        reporterId: reporter.id,
        assigneeId: agent.id,
        status: 'IN_PROGRESS',
        createdAt: new Date(monday.getTime() - 7 * 24 * 3600 * 1000),
        firstResponseDueAt: new Date(monday.getTime() + 6 * 3600 * 1000),
        resolutionDueAt: new Date(monday.getTime() - 7 * 24 * 3600 * 1000 + 4 * 3600 * 1000),
      },
    });

    await prisma.ticket.create({
      data: {
        title: 'Login issue with SSO',
        description: 'Users from acme.example.com cannot log in via SSO since morning.',
        priority: Priority.HIGH,
        reporterId: reporter.id,
        createdAt: friday,
        firstResponseDueAt: new Date(friday.getTime() + 6 * 3600 * 1000),
        resolutionDueAt: new Date(friday.getTime() + 36 * 3600 * 1000),
      },
    });

    await prisma.ticket.create({
      data: {
        title: 'Dashboard charts load slowly',
        description: 'The analytics dashboard takes ~15s to render charts.',
        priority: Priority.MEDIUM,
        reporterId: reporter.id,
        assigneeId: agent.id,
        createdAt: monday,
        firstResponseDueAt: new Date(monday.getTime() + 8 * 3600 * 1000),
        resolutionDueAt: new Date(monday.getTime() + 48 * 3600 * 1000),
      },
    });

    await prisma.ticket.create({
      data: {
        title: 'Typo on the pricing page',
        description: '"Enterpriе" is misspelled in the hero.',
        priority: Priority.LOW,
        reporterId: reporter.id,
        createdAt: monday,
        firstResponseDueAt: new Date(monday.getTime() + 24 * 3600 * 1000),
        resolutionDueAt: new Date(monday.getTime() + 72 * 3600 * 1000),
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
