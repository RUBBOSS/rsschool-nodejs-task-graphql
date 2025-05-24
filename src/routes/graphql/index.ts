import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import { graphql, buildSchema, parse, validate } from 'graphql';
import depthLimit from 'graphql-depth-limit';

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;

  // Create a simple schema
  const schema = buildSchema(`
    type Query {
      hello: String
    }
  `);

  // Simple resolver
  const root = {
    hello: () => 'Hello world!'
  };

  fastify.route({
    url: '/',
    method: 'POST',
    schema: {
      body: createGqlResponseSchema.body,
      response: {
        200: gqlResponseSchema,
      },
    },
    async handler(req) {
      const { query, variables } = req.body as { 
        query: string; 
        variables?: Record<string, any> 
      };
      
      // Parse and validate with depth limit
      if (query) {
        const document = parse(query);
        const validationErrors = validate(schema, document, [
          depthLimit(5) // Limit depth to 5 as required
        ]);
        
        if (validationErrors.length > 0) {
          return { errors: validationErrors };
        }
      }
      
      return await graphql({
        schema,
        source: query,
        rootValue: root,
        variableValues: variables
      });
    },
  });
};

// Export the plugin WITHOUT wrapping it in fp()
// It already has the right signature for Fastify
export default plugin;
