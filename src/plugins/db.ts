import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

// Define the operation history entry type
interface OperationHistoryEntry {
  model: string;
  operation: string;
  args: unknown;
}

// Define the stats interface
interface PrismaStats {
  operationHistory: OperationHistoryEntry[];
}

// Create the extended Prisma client
const createExtendedPrisma = (fastifyInstance: FastifyInstance & { prismaStats: PrismaStats }) => {
  const basePrisma = new PrismaClient({
    log: ['warn', 'error'],
  });

  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // Ensure prismaStats exists and has operationHistory array
          if (!fastifyInstance.prismaStats) {
            fastifyInstance.prismaStats = { operationHistory: [] };
          }
          if (!Array.isArray(fastifyInstance.prismaStats.operationHistory)) {
            fastifyInstance.prismaStats.operationHistory = [];
          }
          
          // Track the operation
          fastifyInstance.prismaStats.operationHistory.push({
            model,
            operation,
            args,
          });
          
          // Execute the original query
          return query(args);
        },
      },
    },
  });
};

type ExtendedPrismaClient = ReturnType<typeof createExtendedPrisma>;

// Add proper TypeScript declarations
declare module 'fastify' {
  interface FastifyInstance {
    prisma: ExtendedPrismaClient;
    prismaStats: PrismaStats;
  }
}

export default fp(async (fastify) => {
  // Initialize the stats tracking first - ensure it exists before creating extended Prisma
  fastify.decorate('prismaStats', {
    operationHistory: [],
  });

  // Use the extended Prisma client with operation tracking
  const extendedPrisma = createExtendedPrisma(fastify as FastifyInstance & { prismaStats: PrismaStats });

  // Make the extended prisma client available to all routes
  fastify.decorate('prisma', extendedPrisma);

  // Gracefully close Prisma client when the app closes
  fastify.addHook('onClose', async () => {
    await extendedPrisma.$disconnect();
  });
}, {
  name: 'db-plugin'
});

// TODO: Re-add the extension and error handler later for stats tracking
/*
// Error handler for Prisma operations (currently unused)
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
*/
