import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { SOURCE_DEFINITIONS } from "../src/data-sources/catalog";
import { buildSourceSeedOperation } from "../src/data-sources/seed-metadata";
import { PrismaClient } from "../src/generated/prisma/client";
import { COUNTRIES, SECTORS } from "../src/lib/constants";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });

async function main() {
  for (const country of COUNTRIES) {
    await prisma.country.upsert({
      where: { code: country.code },
      update: { name: country.name, region: country.region },
      create: country,
    });
  }

  for (const sector of SECTORS) {
    await prisma.sector.upsert({
      where: { slug: sector.slug },
      update: { name: sector.name, description: sector.description },
      create: sector,
    });
  }

  for (const source of SOURCE_DEFINITIONS) {
    await prisma.dataSource.upsert(
      buildSourceSeedOperation(source, {
        [source.baseUrlEnvironmentKey]:
          process.env[source.baseUrlEnvironmentKey],
      }),
    );
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async () => {
    console.error(
      "Database seed failed. Review database connectivity and schema state.",
    );
    await prisma.$disconnect();
    process.exit(1);
  });
