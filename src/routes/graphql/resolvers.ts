import { FastifyInstance } from 'fastify';
import DataLoader from 'dataloader';
import { parseResolveInfo } from 'graphql-parse-resolve-info';
import { UUIDType } from './types/uuid.js';

// Factory function to create DataLoaders per request
export function createDataLoaders(prisma: any) {
  return {
    // DataLoader for Posts by Author ID
    postsByAuthorLoader: new DataLoader(async (authorIds: readonly string[]) => {
      const posts = await prisma.post.findMany({
        where: {
          authorId: { in: [...authorIds] },
        },
      });
      
      return authorIds.map(authorId => 
        posts.filter(post => post.authorId === authorId)
      );
    }),

    // DataLoader for Profiles by User ID
    profilesByUserLoader: new DataLoader(async (userIds: readonly string[]) => {
      const profiles = await prisma.profile.findMany({
        where: {
          userId: { in: [...userIds] },
        },
      });
      
      return userIds.map(userId => 
        profiles.find(profile => profile.userId === userId) || null
      );
    }),

    // DataLoader for MemberTypes by ID
    memberTypesByIdLoader: new DataLoader(async (memberTypeIds: readonly string[]) => {
      const memberTypes = await prisma.memberType.findMany({
        where: {
          id: { in: [...memberTypeIds] },
        },
      });
      
      return memberTypeIds.map(id => 
        memberTypes.find(memberType => memberType.id === id) || null
      );
    }),

    // DataLoader for UserSubscribedTo by User ID
    userSubscribedToLoader: new DataLoader(async (userIds: readonly string[]) => {
      const subscriptions = await prisma.subscribersOnAuthors.findMany({
        where: {
          subscriberId: { in: [...userIds] },
        },
        include: {
          author: true,
        },
      });
      
      return userIds.map(userId => 
        subscriptions
          .filter(sub => sub.subscriberId === userId)
          .map(sub => sub.author)
      );
    }),

    // DataLoader for SubscribedToUser by User ID
    subscribedToUserLoader: new DataLoader(async (userIds: readonly string[]) => {
      const subscriptions = await prisma.subscribersOnAuthors.findMany({
        where: {
          authorId: { in: [...userIds] },
        },
        include: {
          subscriber: true,
        },
      });
      
      return userIds.map(userId => 
        subscriptions
          .filter(sub => sub.authorId === userId)
          .map(sub => sub.subscriber)
      );
    }),
  };
}

export function createResolvers(fastify: FastifyInstance) {
  const { prisma } = fastify;

  return {
    UUID: UUIDType,

    // Query resolvers
    async memberTypes() {
      return await prisma.memberType.findMany();
    },

    async memberType({ id }: { id: string }) {
      return await prisma.memberType.findUnique({
        where: { id },
      });
    },
      async users(_: any, _args: any, context: any, info: any) {
      const { dataLoaders } = context;
      const parsedInfo = parseResolveInfo(info);
      const userFields = parsedInfo?.fieldsByTypeName?.User as any;
      const needsUserSubscribedTo = userFields?.userSubscribedTo;
      const needsSubscribedToUser = userFields?.subscribedToUser;
      const includeOptions: any = {};
      
      if (needsUserSubscribedTo) {
        includeOptions.userSubscribedTo = true;
      }
      
      if (needsSubscribedToUser) {
        includeOptions.subscribedToUser = true;
      }

      const users = await prisma.user.findMany({
        include: Object.keys(includeOptions).length > 0 ? includeOptions : undefined,
      });// Pre-populate DataLoader caches if we have subscription data
      if (users.length > 0) {
        users.forEach((user: any) => {
          if (needsUserSubscribedTo && user.userSubscribedTo) {
            const authors = user.userSubscribedTo.map((sub: any) => sub.author);
            dataLoaders.userSubscribedToLoader.prime(user.id, authors);
          }
          if (needsSubscribedToUser && user.subscribedToUser) {
            const subscribers = user.subscribedToUser.map((sub: any) => sub.subscriber);
            dataLoaders.subscribedToUserLoader.prime(user.id, subscribers);
          }
        });
      }

      return users;
    },

    async user({ id }: { id: string }) {
      return await prisma.user.findUnique({
        where: { id },
      });
    },

    async posts() {
      return await prisma.post.findMany();
    },

    async post({ id }: { id: string }) {
      return await prisma.post.findUnique({
        where: { id },
      });
    },

    async profiles() {
      return await prisma.profile.findMany();
    },

    async profile({ id }: { id: string }) {
      return await prisma.profile.findUnique({
        where: { id },
      });
    },

    // Mutation resolvers
    async createUser({ dto }: { dto: any }) {
      return await prisma.user.create({
        data: dto,
      });
    },

    async createProfile({ dto }: { dto: any }) {
      return await prisma.profile.create({
        data: dto,
      });
    },

    async createPost({ dto }: { dto: any }) {
      return await prisma.post.create({
        data: dto,
      });
    },

    async changeUser({ id, dto }: { id: string; dto: any }) {
      return await prisma.user.update({
        where: { id },
        data: dto,
      });
    },

    async changeProfile({ id, dto }: { id: string; dto: any }) {
      return await prisma.profile.update({
        where: { id },
        data: dto,
      });
    },

    async changePost({ id, dto }: { id: string; dto: any }) {
      return await prisma.post.update({
        where: { id },
        data: dto,
      });
    },

    async deleteUser({ id }: { id: string }) {
      await prisma.user.delete({
        where: { id },
      });
      return 'User deleted';
    },

    async deleteProfile({ id }: { id: string }) {
      await prisma.profile.delete({
        where: { id },
      });
      return 'Profile deleted';
    },

    async deletePost({ id }: { id: string }) {
      await prisma.post.delete({
        where: { id },
      });
      return 'Post deleted';
    },

    async subscribeTo({ userId, authorId }: { userId: string; authorId: string }) {
      await prisma.subscribersOnAuthors.create({
        data: {
          subscriberId: userId,
          authorId,
        },
      });
      return 'Subscribed';
    },    async unsubscribeFrom({ userId, authorId }: { userId: string; authorId: string }) {
      await prisma.subscribersOnAuthors.delete({
        where: {
          subscriberId_authorId: {
            subscriberId: userId,
            authorId,
          },
        },
      });
      return 'Unsubscribed';
    },
    
    // Field resolvers for nested data
    User: {
      async profile(parent: any, _: any, context: any) {
        return await context.dataLoaders.profilesByUserLoader.load(parent.id);
      },

      async posts(parent: any, _: any, context: any) {
        return await context.dataLoaders.postsByAuthorLoader.load(parent.id);
      },

      async userSubscribedTo(parent: any, _: any, context: any) {
        return await context.dataLoaders.userSubscribedToLoader.load(parent.id);
      },

      async subscribedToUser(parent: any, _: any, context: any) {
        return await context.dataLoaders.subscribedToUserLoader.load(parent.id);
      },
    },

    Profile: {
      async memberType(parent: any, _: any, context: any) {
        return await context.dataLoaders.memberTypesByIdLoader.load(parent.memberTypeId);
      },
    },
  };
}
