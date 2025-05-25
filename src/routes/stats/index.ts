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
      // Ensure prismaStats exists and operationHistory is available
      if (!fastify.prismaStats) {
        return {
          operationHistory: []
        };
      }
      
      // Access prismaStats with proper fallback to ensure operationHistory is always available
      return {
        operationHistory: fastify.prismaStats.operationHistory || []
      };
    },
  });
};

export default plugin;
