import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { prismaStatsSchema } from './schemas.js';

// Module declaration is already provided in db.ts, we can rely on it
const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.route({
    url: '/',
    method: 'GET',
    schema: {
      response: {
        200: prismaStatsSchema,
      },
    },
    async handler() {
      // Access prismaStats directly without type casting
      return fastify.prismaStats;
    },
  });
};

export default plugin;
