import "server-only";

import { spawn } from "node:child_process";
import path from "node:path";

import type { ScheduledSourceExecutor } from "@/services/scheduler/scheduler-core";
import type { PrismaSchedulerStore } from "@/services/scheduler/scheduler-prisma-store";

function executeCommand(input: {
  script: string;
  args: readonly string[];
  timeoutMs: number;
}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--conditions=react-server",
        "--import",
        "tsx",
        path.resolve(process.cwd(), input.script),
        ...input.args,
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: "ignore",
      },
    );
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Scheduled provider command timed out."));
    }, input.timeoutMs);
    child.once("error", () => {
      clearTimeout(timeout);
      reject(new Error("Scheduled provider command could not start."));
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            signal
              ? `Scheduled provider command ended with signal ${signal}.`
              : `Scheduled provider command failed with exit code ${code ?? "unknown"}.`,
          ),
        );
    });
  });
}

export function createCommandExecutor(
  store: PrismaSchedulerStore,
): ScheduledSourceExecutor {
  return async ({ definition, source, startedAt }) => {
    for (const scheduledCommand of definition.commands(startedAt)) {
      await executeCommand({
        script: scheduledCommand.script,
        args: scheduledCommand.args,
        timeoutMs:
          definition.sourceId === "ticketmaster" ? 60 * 60_000 : 30 * 60_000,
      });
    }
    return store.ingestionCounts(source.id, startedAt);
  };
}
