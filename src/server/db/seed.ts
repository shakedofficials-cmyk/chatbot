import { prisma } from "./client.js";

async function seed() {
  console.log("Seeding database...");

  // Create a sample session for testing
  await prisma.chatSession.create({
    data: {
      id: "test-session",
      conversationLog: [],
      recentProducts: [],
      recentComparisons: [],
      preferences: {},
    },
  });

  console.log("Seed complete.");
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
