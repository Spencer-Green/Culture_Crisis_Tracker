import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import {
  buildConsumerSpendingData,
  ConsumerSpendingLoadError,
} from "@/services/consumer-spending-core";

describe("consumer spending data", () => {
  it("degrades safely when the database is unavailable", async () => {
    const state = await buildConsumerSpendingData(async () => {
      throw new Prisma.PrismaClientKnownRequestError(
        "Could not connect with postgresql://user:password@database",
        { code: "P1001", clientVersion: "7.9.0" },
      );
    });

    expect(state).toEqual({
      databaseStatus: "unavailable",
      observations: [],
    });
    expect(JSON.stringify(state)).not.toContain("password");
  });

  it("throws a safe error for unexpected application failures", async () => {
    let caughtError: unknown;

    try {
      await buildConsumerSpendingData(async () => {
        throw new Prisma.PrismaClientValidationError(
          "Unexpected query defect with DATABASE_URL=secret",
          { clientVersion: "7.9.0" },
        );
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      name: "ConsumerSpendingLoadError",
      message: "Consumer spending data could not be loaded.",
    });
    expect(caughtError).toBeInstanceOf(ConsumerSpendingLoadError);
    expect(JSON.stringify(caughtError)).not.toContain("secret");
  });
});
