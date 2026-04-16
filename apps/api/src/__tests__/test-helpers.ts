import Fastify, { type FastifyInstance } from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

/**
 * Creates a test Fastify instance with plugins registered (no cache plugin — no Redis in tests).
 */
export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  return app;
}
