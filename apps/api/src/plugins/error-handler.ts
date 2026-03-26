import fp from "fastify-plugin";
import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from "fastify";

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
