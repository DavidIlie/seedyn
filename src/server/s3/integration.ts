import "server-only";

import { env } from "~/env";

import type { S3GatewayAdapter } from "./adapter";
import { seedynS3GatewayAdapter } from "./app-adapter";

export async function getS3GatewayAdapter(): Promise<S3GatewayAdapter | null> {
  // Keep the route present but fail closed with an S3 ServiceUnavailable XML
  // response until this installation has a credential-derivation secret.
  return env.S3_MASTER_SECRET ? seedynS3GatewayAdapter : null;
}
