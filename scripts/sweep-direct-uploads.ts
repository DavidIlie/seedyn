import { db } from "~/server/db";
import { sweepExpiredDirectUploads } from "~/server/uploads/direct/session";

const result = await sweepExpiredDirectUploads();
process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.failed > 0) process.exitCode = 2;

await db.$disconnect();
