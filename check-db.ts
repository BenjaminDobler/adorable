import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const userCount = await prisma.user.count();
    const projectCount = await prisma.project.count();
    console.log(`Users found: ${userCount}`);
    console.log(`Projects found: ${projectCount}`);
    
    const users = await prisma.user.findMany({
      include: { _count: { select: { projects: true } } }
    });
    
    console.log('--- User Details ---');
    users.forEach(u => {
      console.log(`User: ${u.email} (ID: ${u.id}) - Projects: ${u._count.projects}`);
    });

  } catch (e) {
    console.error('Error connecting to database:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
