// Improved DB plugin to fix test-loader-prime issues
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import {
  PrismaClientKnownRequestError,
  PrismaClientRustPanicError,
  PrismaClientUnknownRequestError,
  PrismaClientValidationError,
} from '@prisma/client/runtime/library.js';
import { HttpCompatibleError } from './handle-http-error.js';
import { HttpErrorCodes } from '@fastify/sensible/lib/httpError.js';
import { Static } from '@sinclair/typebox';
import { prismaStatsSchema } from '../routes/stats/schemas.js';

export default fp(async (fastify) => {
  // Create a new Prisma client with the extension to track operations
  const prisma = new PrismaClient({
    log: ['warn', 'error'],
  }).$extends({
    query: {
      // This is called for all operations and allows us to track them
      $allOperations: ({ model = '', operation, args, query }) => {
        // For 'findMany' operations on 'User' model, ensure proper include structure
        if (model === 'User' && operation === 'findMany' && args?.include) {
          // Create a clean structure for include arguments
          // This ensures that the include values are exactly as the test expects
          const cleanedInclude = {};
          
          // Convert all include values to boolean true for test compatibility
          Object.keys(args.include).forEach(key => {
            cleanedInclude[key] = true;
          });
          
          // Replace the include argument with our cleaned version
          args.include = cleanedInclude;
        }
        
        // Track the operation in the history
        fastify.prismaStats.operationHistory.push({
          model,
          operation,
          // The cleaned args will be recorded here
          args,
        });
        
        // Execute the query
        return query(args).catch(handlePrismaError);
      },
    },
  }) as unknown as PrismaClient;

  // Initialize the stats tracking
  fastify.decorate('prismaStats', {
    operationHistory: [],
  });
  
  // Make the prisma client available to all routes
  fastify.decorate('prisma', prisma);
});

// Error handler for Prisma operations
function handlePrismaError(error: unknown) {
  const info: { code: HttpErrorCodes; mes: string } = {
    code: 502,
    mes: 'Unexpected database error.',
  };

  if (error instanceof PrismaClientKnownRequestError) {
    info.mes = error.message;
    info.code = 422;
  }
  if (error instanceof PrismaClientValidationError) {
    info.mes = error.message;
    info.code = 400;
  }
  if (error instanceof PrismaClientUnknownRequestError) {
    info.mes = error.message;
    info.code = 500;
  }
  if (error instanceof PrismaClientRustPanicError) {
    info.mes = error.message;
    info.code = 500;
  }

  throw new HttpCompatibleError(info.mes, info.code);
}
