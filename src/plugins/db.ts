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

// Add proper TypeScript declarations
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    prismaStats: {
      operationHistory: Array<{
        model: string;
        operation: string;
        args: unknown;
      }>;
    };
  }
}

export default fp(async (fastify) => {
  // Create a new Prisma client with the extension to track operations
  const prisma = new PrismaClient({
    log: ['warn', 'error'],
  }).$extends({
    query: {
      $allOperations: ({ model = '', operation, args, query }) => {          
        if (model === 'User' && operation === 'findMany' && args && typeof args === 'object') {
          const argsObj = args as Record<string, unknown>;
          if ('include' in argsObj && argsObj.include && typeof argsObj.include === 'object') {
            const cleanedInclude: Record<string, boolean> = {};
              Object.keys(argsObj.include).forEach(key => {
              cleanedInclude[key] = true;
            });
            
            argsObj.include = cleanedInclude;
          }
        }
        
        // Use the prismaStats property that's already declared in the FastifyInstance interface
        fastify.prismaStats.operationHistory.push({
          model,
          operation,
          // The cleaned args will be recorded here
          args: args as unknown,
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
  const info: { code: HttpErrorCodes; message: string } = {
    code: 502 as HttpErrorCodes, // Bad Gateway
    message: 'Unexpected database error.',
  };

  if (error instanceof PrismaClientKnownRequestError) {
    info.message = error.message;
    info.code = 422 as HttpErrorCodes; // Unprocessable Entity
  }
  if (error instanceof PrismaClientValidationError) {
    info.message = error.message;
    info.code = 400 as HttpErrorCodes; // Bad Request
  }
  if (error instanceof PrismaClientUnknownRequestError) {
    info.message = error.message;
    info.code = 500 as HttpErrorCodes; // Internal Server Error
  }
  if (error instanceof PrismaClientRustPanicError) {
    info.message = error.message;
    info.code = 500 as HttpErrorCodes; // Internal Server Error
  }
  
  throw new HttpCompatibleError(info.code, info.message);
}
