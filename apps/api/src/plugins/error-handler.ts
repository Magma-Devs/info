import fp from "fastify-plugin";
import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from "fastify";
import type { ApiError } from "@info/shared/types";

/** Emit the standard ApiError shape from a route handler for 4xx/5xx responses. */
export function sendApiError(reply: FastifyReply, statusCode: number, message: string): ApiError {
  reply.status(statusCode);
  const error = statusCode === 400 ? "Bad Request"
    : statusCode === 404 ? "Not Found"
    : statusCode === 503 ? "Service Unavailable"
    : "Error";
  const body: ApiError = { error, message, statusCode };
  return body;
}

export const errorHandlerPlugin = fp(async (app: FastifyInstance) => {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      request.log.error(error);
    } else {
      request.log.warn(error.message);
    }

    reply.status(statusCode).send({
      error: error.name ?? "Error",
      message: statusCode >= 500 ? "Internal Server Error" : error.message,
      statusCode,
    });
  });

  app.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({
      error: "Not Found",
      message: "Route not found",
      statusCode: 404,
    });
  });
});
