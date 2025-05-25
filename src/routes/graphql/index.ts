import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import { graphql, buildSchema, parse, validate } from 'graphql';
import depthLimit from 'graphql-depth-limit';
import { UUIDType } from './types/uuid.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define interfaces for GraphQL types based on schema.graphql
interface User {
  id: string;
  name: string;
  balance: number;
}

interface Profile {
  id: string;
  isMale: boolean;
  yearOfBirth: number;
  memberTypeId: string; // Assuming MemberTypeId is a string enum in the DB
  userId: string;
}

interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
}

interface MemberType {
  id: string; // Assuming MemberTypeId is a string enum in the DB
  discount: number;
  postsLimitPerMonth: number;
}

// Define interfaces for DTOs based on schema.graphql input types
interface CreateUserInput {
  name: string;
  balance: number;
}

interface CreateProfileInput {
  isMale: boolean;
  yearOfBirth: number;
  userId: string;
  memberTypeId: string; // Assuming MemberTypeId is a string enum in the DB
}

interface CreatePostInput {
  title: string;
  content: string;
  authorId: string;
}

interface ChangeUserInput {
  name?: string;
  balance?: number;
}

interface ChangeProfileInput {
  isMale?: boolean;
  yearOfBirth?: number;
  memberTypeId?: string; // Assuming MemberTypeId is a string enum in the DB
}

interface ChangePostInput {
  title?: string;
  content?: string;
}

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { prisma } = fastify;

  // Read the GraphQL schema from the root schema.graphql file
  const schemaPath = join(__dirname, '../../../schema.graphql');
  const typeDefs = readFileSync(schemaPath, 'utf8');

  // Create the schema with custom scalars
  const schema = buildSchema(typeDefs);
  
  // Add the UUID scalar resolver
  schema.getTypeMap()['UUID'] = UUIDType;

  // Define resolvers
  const resolvers = {
    // Query resolvers
    memberTypes: async (): Promise<MemberType[]> => {
      return await prisma.memberType.findMany();
    },
    
    memberType: async (args: { id: string }): Promise<MemberType | null> => {
      return await prisma.memberType.findUnique({
        where: { id: args.id } // Removed 'as any'
      });
    },
    
    users: async (): Promise<User[]> => {
      return await prisma.user.findMany();
    },
    
    user: async (args: { id: string }): Promise<User | null> => {
      return await prisma.user.findUnique({
        where: { id: args.id }
      });
    },
    
    posts: async (): Promise<Post[]> => {
      return await prisma.post.findMany();
    },
    
    post: async (args: { id: string }): Promise<Post | null> => {
      return await prisma.post.findUnique({
        where: { id: args.id }
      });
    },
    
    profiles: async (): Promise<Profile[]> => {
      return await prisma.profile.findMany({
        include: { memberType: true }
      });
    },
    
    profile: async (args: { id: string }): Promise<Profile | null> => {
      return await prisma.profile.findUnique({
        where: { id: args.id },
        include: { memberType: true }
      });
    },

    // Mutation resolvers
    createUser: async (args: { dto: CreateUserInput }): Promise<User> => {
      return await prisma.user.create({
        data: args.dto
      });
    },
    
    createProfile: async (args: { dto: CreateProfileInput }): Promise<Profile> => {
      return await prisma.profile.create({
        data: args.dto,
        include: { memberType: true }
      });
    },
    
    createPost: async (args: { dto: CreatePostInput }): Promise<Post> => {
      return await prisma.post.create({
        data: args.dto
      });
    },
    
    changePost: async (args: { id: string; dto: ChangePostInput }): Promise<Post> => {
      return await prisma.post.update({
        where: { id: args.id },
        data: args.dto
      });
    },
    
    changeProfile: async (args: { id: string; dto: ChangeProfileInput }): Promise<Profile> => {
      return await prisma.profile.update({
        where: { id: args.id },
        data: args.dto,
        include: { memberType: true }
      });
    },
    
    changeUser: async (args: { id: string; dto: ChangeUserInput }): Promise<User> => {
      return await prisma.user.update({
        where: { id: args.id },
        data: args.dto
      });
    },
    
    deleteUser: async (args: { id: string }) => {
      await prisma.user.delete({
        where: { id: args.id }
      });
      return "User deleted successfully";
    },
    
    deletePost: async (args: { id: string }) => {
      await prisma.post.delete({
        where: { id: args.id }
      });
      return "Post deleted successfully";
    },
    
    deleteProfile: async (args: { id: string }) => {
      await prisma.profile.delete({
        where: { id: args.id }
      });
      return "Profile deleted successfully";
    },
    
    subscribeTo: async (args: { userId: string; authorId: string }) => {
      await prisma.subscribersOnAuthors.create({
        data: {
          authorId: args.authorId,
          subscriberId: args.userId
        }
      });
      return "Subscription created successfully";
    },
    
    unsubscribeFrom: async (args: { userId: string; authorId: string }) => {
      await prisma.subscribersOnAuthors.delete({
        where: {
          subscriberId_authorId: {
            subscriberId: args.userId,
            authorId: args.authorId
          }
        }
      });
      return "Unsubscribed successfully";
    }
  };

  // Field resolvers for nested data
  const fieldResolvers = {
    User: {
      profile: async (parent: User): Promise<Profile | null> => {
        return await prisma.profile.findUnique({
          where: { userId: parent.id },
          include: { memberType: true }
        });
      },
      posts: async (parent: User): Promise<Post[]> => {
        return await prisma.post.findMany({
          where: { authorId: parent.id }
        });
      },
      userSubscribedTo: async (parent: User): Promise<User[]> => {
        const subscriptions = await prisma.subscribersOnAuthors.findMany({
          where: { subscriberId: parent.id },
          include: { author: true }
        });
        return subscriptions.map(sub => sub.author);
      },
      subscribedToUser: async (parent: User): Promise<User[]> => {
        const subscriptions = await prisma.subscribersOnAuthors.findMany({
          where: { authorId: parent.id },
          include: { subscriber: true }
        });
        return subscriptions.map(sub => sub.subscriber);
      }
    },
    Profile: {
      memberType: async (parent: Profile): Promise<MemberType | null> => {
        // Assuming parent.memberTypeId is available on the Profile object from Prisma
        // If not, this might need adjustment based on how Prisma returns the Profile
        if (!parent.memberTypeId) return null; 
        return await prisma.memberType.findUnique({
          where: { id: parent.memberTypeId }
        });
      }
    }
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
        variables?: Record<string, unknown> // Changed from any to unknown
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
        rootValue: { ...resolvers, ...fieldResolvers },
        variableValues: variables
      });
    },
  });
};

// Export the plugin WITHOUT wrapping it in fp()
// It already has the right signature for Fastify
export default plugin;
