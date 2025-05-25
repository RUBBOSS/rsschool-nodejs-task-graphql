import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { createGqlResponseSchema, gqlResponseSchema } from './schemas.js';
import {
  graphql,
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLFloat,
  GraphQLInt,
  GraphQLBoolean,
  GraphQLList,
  GraphQLNonNull,
  GraphQLInputObjectType,
  GraphQLEnumType,
  parse,
  validate,
  GraphQLResolveInfo
} from 'graphql';
import depthLimit from 'graphql-depth-limit';
import { UUIDType } from './types/uuid.js';
import DataLoader from 'dataloader';
import type { User, Post, Profile, MemberType } from '@prisma/client';

// Define extended types for relationships
type SubscriberOnAuthor = {
  subscriberId: string;
  authorId: string;
  subscriber: User;
  author: User;
};

// Define a minimal Prisma interface for our needs
interface PrismaLike {
  user: {
    findMany: (args?: unknown) => Promise<User[]>;
    findUnique: (args: unknown) => Promise<User | null>;
    create: (args: unknown) => Promise<User>;
    update: (args: unknown) => Promise<User>;
    delete: (args: unknown) => Promise<User>;
  };
  post: {
    findMany: (args?: unknown) => Promise<Post[]>;
    findUnique: (args: unknown) => Promise<Post | null>;
    create: (args: unknown) => Promise<Post>;
    update: (args: unknown) => Promise<Post>;
    delete: (args: unknown) => Promise<Post>;
  };
  profile: {
    findMany: (args?: unknown) => Promise<Profile[]>;
    findUnique: (args: unknown) => Promise<Profile | null>;
    create: (args: unknown) => Promise<Profile>;
    update: (args: unknown) => Promise<Profile>;
    delete: (args: unknown) => Promise<Profile>;
  };
  memberType: {
    findMany: (args?: unknown) => Promise<MemberType[]>;
    findUnique: (args: unknown) => Promise<MemberType | null>;
  };
  subscribersOnAuthors: {
    findMany: (args?: unknown) => Promise<SubscriberOnAuthor[]>;
    create: (args: unknown) => Promise<SubscriberOnAuthor>;
    delete: (args: unknown) => Promise<SubscriberOnAuthor>;
  };
}

// Define context type
interface GraphQLContext {
  loaders: {
    users: DataLoader<string, User | null>;
    posts: DataLoader<string, Post | null>;
    profiles: DataLoader<string, Profile | null>;
    memberTypes: DataLoader<string, MemberType | null>;
    postsByAuthor: DataLoader<string, Post[]>;
    profileByUserId: DataLoader<string, Profile | null>;
    userSubscribedTo: DataLoader<string, User[]>;
    subscribedToUser: DataLoader<string, User[]>;
  };
  prisma: PrismaLike;
}

// Define input argument types
interface IdArgs {
  id: string;
}

interface CreateUserArgs {
  dto: {
    name: string;
    balance: number;
  };
}

interface CreatePostArgs {
  dto: {
    title: string;
    content: string;
    authorId: string;
  };
}

interface CreateProfileArgs {
  dto: {
    isMale: boolean;
    yearOfBirth: number;
    userId: string;
    memberTypeId: 'BASIC' | 'BUSINESS';
  };
}

interface ChangeUserArgs {
  id: string;
  dto: {
    name?: string;
    balance?: number;
  };
}

interface ChangePostArgs {
  id: string;
  dto: {
    title?: string;
    content?: string;
  };
}

interface ChangeProfileArgs {
  id: string;
  dto: {
    isMale?: boolean;
    yearOfBirth?: number;
    memberTypeId?: 'BASIC' | 'BUSINESS';
  };
}

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {  const { prisma } = fastify;
  
  if (!prisma) {
    console.warn('Warning: Prisma client not available in GraphQL plugin');
    return;
  }

  // Create DataLoaders for N+1 problem solving
  const createLoaders = (): GraphQLContext['loaders'] => ({
    users: new DataLoader(async (userIds: readonly string[]) => {
      const users = await prisma.user.findMany({
        where: { id: { in: [...userIds] } }
      });
      return userIds.map(id => users.find(user => user.id === id) || null);
    }),

    posts: new DataLoader(async (postIds: readonly string[]) => {
      const posts = await prisma.post.findMany({
        where: { id: { in: [...postIds] } }
      });
      return postIds.map(id => posts.find(post => post.id === id) || null);
    }),

    profiles: new DataLoader(async (profileIds: readonly string[]) => {
      const profiles = await prisma.profile.findMany({
        where: { id: { in: [...profileIds] } }
      });
      return profileIds.map(id => profiles.find(profile => profile.id === id) || null);
    }),

    memberTypes: new DataLoader(async (memberTypeIds: readonly string[]) => {
      const memberTypes = await prisma.memberType.findMany({
        where: { id: { in: [...memberTypeIds] } }
      });
      return memberTypeIds.map(id => memberTypes.find(mt => mt.id === id) || null);
    }),

    postsByAuthor: new DataLoader(async (authorIds: readonly string[]) => {
      const posts = await prisma.post.findMany({
        where: { authorId: { in: [...authorIds] } }
      });
      return authorIds.map(authorId => posts.filter(post => post.authorId === authorId));
    }),

    profileByUserId: new DataLoader(async (userIds: readonly string[]) => {
      const profiles = await prisma.profile.findMany({
        where: { userId: { in: [...userIds] } }
      });
      return userIds.map(userId => profiles.find(profile => profile.userId === userId) || null);
    }),

    userSubscribedTo: new DataLoader(async (userIds: readonly string[]) => {
      const subscriptions = await prisma.subscribersOnAuthors.findMany({
        where: { subscriberId: { in: [...userIds] } },
        include: { author: true }
      }) as SubscriberOnAuthor[];
      return userIds.map(userId => 
        subscriptions.filter(sub => sub.subscriberId === userId).map(sub => sub.author)
      );
    }),

    subscribedToUser: new DataLoader(async (userIds: readonly string[]) => {
      const subscriptions = await prisma.subscribersOnAuthors.findMany({
        where: { authorId: { in: [...userIds] } },
        include: { subscriber: true }
      }) as SubscriberOnAuthor[];
      return userIds.map(userId => 
        subscriptions.filter(sub => sub.authorId === userId).map(sub => sub.subscriber)
      );
    })
  });

  // Define GraphQL Enums
  const MemberTypeIdEnum = new GraphQLEnumType({
    name: 'MemberTypeId',
    values: {
      BASIC: { value: 'BASIC' },
      BUSINESS: { value: 'BUSINESS' }
    }
  });

  // Define GraphQL Input Types
  const CreateUserInputType = new GraphQLInputObjectType({
    name: 'CreateUserInput',
    fields: {
      name: { type: new GraphQLNonNull(GraphQLString) },
      balance: { type: new GraphQLNonNull(GraphQLFloat) }
    }
  });

  const CreatePostInputType = new GraphQLInputObjectType({
    name: 'CreatePostInput',
    fields: {
      title: { type: new GraphQLNonNull(GraphQLString) },
      content: { type: new GraphQLNonNull(GraphQLString) },
      authorId: { type: new GraphQLNonNull(UUIDType) }
    }
  });

  const CreateProfileInputType = new GraphQLInputObjectType({
    name: 'CreateProfileInput',
    fields: {
      isMale: { type: new GraphQLNonNull(GraphQLBoolean) },
      yearOfBirth: { type: new GraphQLNonNull(GraphQLInt) },
      userId: { type: new GraphQLNonNull(UUIDType) },
      memberTypeId: { type: new GraphQLNonNull(MemberTypeIdEnum) }
    }
  });

  const ChangeUserInputType = new GraphQLInputObjectType({
    name: 'ChangeUserInput',
    fields: {
      name: { type: GraphQLString },
      balance: { type: GraphQLFloat }
    }
  });

  const ChangePostInputType = new GraphQLInputObjectType({
    name: 'ChangePostInput',
    fields: {
      title: { type: GraphQLString },
      content: { type: GraphQLString }
    }
  });

  const ChangeProfileInputType = new GraphQLInputObjectType({
    name: 'ChangeProfileInput',
    fields: {
      isMale: { type: GraphQLBoolean },
      yearOfBirth: { type: GraphQLInt },
      memberTypeId: { type: MemberTypeIdEnum }
    }
  });

  // Define GraphQL Object Types
  const MemberTypeType = new GraphQLObjectType({
    name: 'MemberType',
    fields: {
      id: { type: new GraphQLNonNull(MemberTypeIdEnum) },
      discount: { type: new GraphQLNonNull(GraphQLFloat) },
      postsLimitPerMonth: { type: new GraphQLNonNull(GraphQLInt) }
    }
  });  // Define GraphQL Object Types with proper forward references
  const UserType: GraphQLObjectType = new GraphQLObjectType({
    name: 'User',
    fields: () => ({
      id: { type: new GraphQLNonNull(UUIDType) },
      name: { type: new GraphQLNonNull(GraphQLString) },
      balance: { type: new GraphQLNonNull(GraphQLFloat) },
      profile: {
        type: ProfileType,
        resolve: async (parent: User, _args: unknown, context: GraphQLContext) => {
          return context.loaders.profileByUserId.load(parent.id);
        }
      },
      posts: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(PostType))),
        resolve: async (parent: User, _args: unknown, context: GraphQLContext) => {
          return context.loaders.postsByAuthor.load(parent.id);
        }
      },
      userSubscribedTo: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(UserType))),
        resolve: async (parent: User, _args: unknown, context: GraphQLContext) => {
          return context.loaders.userSubscribedTo.load(parent.id);
        }
      },
      subscribedToUser: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(UserType))),
        resolve: async (parent: User, _args: unknown, context: GraphQLContext) => {
          return context.loaders.subscribedToUser.load(parent.id);
        }
      }
    })
  });

  const PostType: GraphQLObjectType = new GraphQLObjectType({
    name: 'Post',
    fields: () => ({
      id: { type: new GraphQLNonNull(UUIDType) },
      title: { type: new GraphQLNonNull(GraphQLString) },
      content: { type: new GraphQLNonNull(GraphQLString) },
      user: {
        type: new GraphQLNonNull(UserType),
        resolve: async (parent: Post, _args: unknown, context: GraphQLContext) => {
          return context.loaders.users.load(parent.authorId);
        }
      }
    })
  });

  const ProfileType: GraphQLObjectType = new GraphQLObjectType({
    name: 'Profile',
    fields: () => ({
      id: { type: new GraphQLNonNull(UUIDType) },
      isMale: { type: new GraphQLNonNull(GraphQLBoolean) },
      yearOfBirth: { type: new GraphQLNonNull(GraphQLInt) },
      memberType: {
        type: new GraphQLNonNull(MemberTypeType),
        resolve: async (parent: Profile, _args: unknown, context: GraphQLContext) => {
          return context.loaders.memberTypes.load(parent.memberTypeId);
        }
      },
      user: {
        type: new GraphQLNonNull(UserType),
        resolve: async (parent: Profile, _args: unknown, context: GraphQLContext) => {
          return context.loaders.users.load(parent.userId);
        }
      }
    })
  });
  // Define Query type
  const QueryType = new GraphQLObjectType({
    name: 'Query',
    fields: {      memberType: {
        type: MemberTypeType,
        args: { id: { type: new GraphQLNonNull(MemberTypeIdEnum) } },
        resolve: async (_parent: unknown, args: IdArgs, context: GraphQLContext) => {
          return context.loaders.memberTypes.load(args.id);
        }
      },      memberTypes: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(MemberTypeType))),
        resolve: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
          return await context.prisma.memberType.findMany();
        }
      },
      users: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(UserType))),
        resolve: async (_parent: unknown, _args: unknown, context: GraphQLContext, _info: GraphQLResolveInfo) => {
          // Simple approach - always include subscriptions for now to avoid complex parsing
          type UserWithSubscriptions = User & {
            userSubscribedTo?: Array<{ author: User }>;
            subscribedToUser?: Array<{ subscriber: User }>;
          };          const users = await context.prisma.user.findMany({
            include: {
              userSubscribedTo: { include: { author: true } },
              subscribedToUser: { include: { subscriber: true } }
            }
          }) as UserWithSubscriptions[];

          // Prime the DataLoader cache with fetched users and their subscription relationships
          users.forEach((user: UserWithSubscriptions) => {
            // Prime user cache
            context.loaders.users.prime(user.id, {
              id: user.id,
              name: user.name,
              balance: user.balance
            });
            
            if (user.userSubscribedTo) {
              const subscribedToUsers = user.userSubscribedTo.map(sub => sub.author);
              context.loaders.userSubscribedTo.prime(user.id, subscribedToUsers);
            }
            
            if (user.subscribedToUser) {
              const subscriberUsers = user.subscribedToUser.map(sub => sub.subscriber);
              context.loaders.subscribedToUser.prime(user.id, subscriberUsers);
            }
          });

          return users.map((user: UserWithSubscriptions) => ({
            id: user.id,
            name: user.name,
            balance: user.balance
          }));
        }
      },
      user: {
        type: UserType,
        args: { id: { type: new GraphQLNonNull(UUIDType) } },
        resolve: async (_parent: unknown, args: IdArgs, context: GraphQLContext) => {
          return context.loaders.users.load(args.id);        }
      },      posts: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(PostType))),
        resolve: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
          return await context.prisma.post.findMany();
        }
      },
      post: {
        type: PostType,
        args: { id: { type: new GraphQLNonNull(UUIDType) } },
        resolve: async (_parent: unknown, args: IdArgs, context: GraphQLContext) => {
          return context.loaders.posts.load(args.id);
        }
      },      profiles: {
        type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(ProfileType))),
        resolve: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
          return await context.prisma.profile.findMany();
        }
      },
      profile: {
        type: ProfileType,
        args: { id: { type: new GraphQLNonNull(UUIDType) } },
        resolve: async (_parent: unknown, args: IdArgs, context: GraphQLContext) => {
          return context.loaders.profiles.load(args.id);
        }
      }
    }
  });

  // Define Mutation type
  const MutationType = new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      createUser: {
        type: new GraphQLNonNull(UserType),
        args: { dto: { type: new GraphQLNonNull(CreateUserInputType) } },
        resolve: async (_parent: unknown, args: CreateUserArgs, context: GraphQLContext) => {
          return await context.prisma.user.create({ data: args.dto });
        }
      },
      createProfile: {
        type: new GraphQLNonNull(ProfileType),
        args: { dto: { type: new GraphQLNonNull(CreateProfileInputType) } },
        resolve: async (_parent: unknown, args: CreateProfileArgs, context: GraphQLContext) => {
          return await context.prisma.profile.create({ data: args.dto });
        }
      },
      createPost: {
        type: new GraphQLNonNull(PostType),
        args: { dto: { type: new GraphQLNonNull(CreatePostInputType) } },
        resolve: async (_parent: unknown, args: CreatePostArgs, context: GraphQLContext) => {
          return await context.prisma.post.create({ data: args.dto });
        }
      },
      changeUser: {
        type: new GraphQLNonNull(UserType),
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
          dto: { type: new GraphQLNonNull(ChangeUserInputType) }
        },
        resolve: async (_parent: unknown, args: ChangeUserArgs, context: GraphQLContext) => {
          return await context.prisma.user.update({
            where: { id: args.id },
            data: args.dto
          });
        }
      },
      changePost: {
        type: new GraphQLNonNull(PostType),
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
          dto: { type: new GraphQLNonNull(ChangePostInputType) }
        },
        resolve: async (_parent: unknown, args: ChangePostArgs, context: GraphQLContext) => {
          return await context.prisma.post.update({
            where: { id: args.id },
            data: args.dto
          });
        }
      },
      changeProfile: {
        type: new GraphQLNonNull(ProfileType),
        args: {
          id: { type: new GraphQLNonNull(UUIDType) },
          dto: { type: new GraphQLNonNull(ChangeProfileInputType) }
        },
        resolve: async (_parent: unknown, args: ChangeProfileArgs, context: GraphQLContext) => {
          return await context.prisma.profile.update({
            where: { id: args.id },
            data: args.dto
          });
        }
      },
      deleteUser: {
        type: new GraphQLNonNull(GraphQLString),
        args: { id: { type: new GraphQLNonNull(UUIDType) } },
        resolve: async (_parent: unknown, args: IdArgs, context: GraphQLContext) => {
          await context.prisma.user.delete({ where: { id: args.id } });
          return 'User deleted successfully';
        }
      },
      deletePost: {
        type: new GraphQLNonNull(GraphQLString),
        args: { id: { type: new GraphQLNonNull(UUIDType) } },
        resolve: async (_parent: unknown, args: IdArgs, context: GraphQLContext) => {
          await context.prisma.post.delete({ where: { id: args.id } });
          return 'Post deleted successfully';
        }
      },
      deleteProfile: {
        type: new GraphQLNonNull(GraphQLString),
        args: { id: { type: new GraphQLNonNull(UUIDType) } },
        resolve: async (_parent: unknown, args: IdArgs, context: GraphQLContext) => {
          await context.prisma.profile.delete({ where: { id: args.id } });
          return 'Profile deleted successfully';
        }
      },      subscribeTo: {
        type: new GraphQLNonNull(GraphQLString),
        args: {
          userId: { type: new GraphQLNonNull(UUIDType) },
          authorId: { type: new GraphQLNonNull(UUIDType) }
        },
        resolve: async (_parent: unknown, args: { userId: string; authorId: string }, context: GraphQLContext) => {
          await context.prisma.subscribersOnAuthors.create({
            data: {
              subscriberId: args.userId,
              authorId: args.authorId
            }
          });
          return 'User subscribed successfully';
        }
      },
      unsubscribeFrom: {
        type: new GraphQLNonNull(GraphQLString),
        args: {
          userId: { type: new GraphQLNonNull(UUIDType) },
          authorId: { type: new GraphQLNonNull(UUIDType) }
        },
        resolve: async (_parent: unknown, args: { userId: string; authorId: string }, context: GraphQLContext) => {
          await context.prisma.subscribersOnAuthors.delete({
            where: {
              subscriberId_authorId: {
                subscriberId: args.userId,
                authorId: args.authorId
              }
            }
          });
          return 'User unsubscribed successfully';
        }
      }
    }
  });

  // Create the schema
  const schema = new GraphQLSchema({
    query: QueryType,
    mutation: MutationType
  });

  fastify.route({
    url: '/',
    method: 'POST',
    schema: {
      ...createGqlResponseSchema,
      response: {
        200: gqlResponseSchema,
      },
    },    async handler(req) {
      const { query, variables } = req.body as { query: string; variables?: Record<string, unknown> };

      // Parse and validate query
      const document = parse(query);
      const validationErrors = validate(schema, document, [depthLimit(5)]);

      if (validationErrors.length > 0) {
        return {
          errors: validationErrors.map(error => ({
            message: error.message,
            locations: error.locations,
            path: error.path,
          })),
        };
      }      // Create context with loaders
      const context: GraphQLContext = {
        loaders: createLoaders(),
        prisma: prisma as unknown as PrismaLike
      };
        // Execute GraphQL query
      const result = await graphql({
        schema,
        source: query,
        variableValues: variables,
        contextValue: context,
      });

      return result;
    },
  });
};

export default plugin;
