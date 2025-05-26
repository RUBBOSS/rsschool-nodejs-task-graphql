import { FastifyInstance } from 'fastify';
import { Static } from '@sinclair/typebox';
import {
  createGqlResponseSchema,
  gqlResponseSchema,
} from '../../src/routes/graphql/schemas.js';
import { userSchema } from '../../src/routes/users/schemas.js';
import { profileSchema } from '../../src/routes/profiles/schemas.js';
import { postSchema } from '../../src/routes/posts/schemas.js';
import { MemberTypeId, memberTypeSchema } from '../../src/routes/member-types/schemas.js';
import { prismaStatsSchema } from '../../src/routes/stats/schemas.js';

type UserBody = Static<typeof userSchema>;
type ProfileBody = Static<typeof profileSchema>;
type PostBody = Static<typeof postSchema>;
type MemberTypeBody = Static<typeof memberTypeSchema>;

export async function gqlQuery(
  app: FastifyInstance,
  dto: Static<(typeof createGqlResponseSchema)['body']>,
) {
  const res = await app.inject({
    url: `/graphql`,
    method: 'POST',
    body: dto,
  });
  const body = (await res.json()) as Static<typeof gqlResponseSchema>;
  return { res, body };
}

export async function getUsers(app: FastifyInstance) {
  const res = await app.inject({
    url: `/users`,
    method: 'GET',
  });
  const body = (await res.json()) as UserBody[];
  return { res, body };
}

export async function getProfiles(app: FastifyInstance) {
  const res = await app.inject({
    url: `/profiles`,
    method: 'GET',
  });
  const body = (await res.json()) as ProfileBody[];
  return { res, body };
}

export async function getPosts(app: FastifyInstance) {
  const res = await app.inject({
    url: `/posts`,
    method: 'GET',
  });
  const body = (await res.json()) as PostBody[];
  return { res, body };
}

export async function getMemberTypes(app: FastifyInstance) {
  const res = await app.inject({
    url: `/member-types`,
    method: 'GET',
  });
  const body = (await res.json()) as MemberTypeBody[];
  return { res, body };
}

export async function getUser(app: FastifyInstance, id: string) {
  const res = await app.inject({
    url: `/users/${id}`,
    method: 'GET',
  });
  const body = (await res.json()) as UserBody;
  return { res, body };
}

export async function getProfile(app: FastifyInstance, id: string) {
  const res = await app.inject({
    url: `/profiles/${id}`,
    method: 'GET',
  });
  const body = (await res.json()) as ProfileBody;
  return { res, body };
}

export async function getPost(app: FastifyInstance, id: string) {
  const res = await app.inject({
    url: `/posts/${id}`,
    method: 'GET',
  });
  const body = (await res.json()) as PostBody;
  return { res, body };
}

export async function getMemberType(app: FastifyInstance, id: string) {
  const res = await app.inject({
    url: `/member-types/${id}`,
    method: 'GET',
  });
  const body = (await res.json()) as MemberTypeBody;
  return { res, body };
}

export async function subscribeTo(
  app: FastifyInstance,
  userId: string,
  authorId: string,
) {
  const res = await app.inject({
    url: `/users/${userId}/user-subscribed-to/`,
    method: 'POST',
    payload: {
      authorId,
    },
  });
  return { res, body: {} };
}

export async function subscribedToUser(app: FastifyInstance, userId: string) {
  const res = await app.inject({
    url: `/users/${userId}/subscribed-to-user`,
    method: 'GET',
  });
  const body = (await res.json()) as UserBody[];
  return { res, body };
}

export async function unsubscribeFrom(
  app: FastifyInstance,
  userId: string,
  authorId: string,
) {
  const res = await app.inject({
    url: `/users/${userId}/user-subscribed-to/${authorId}`,
    method: 'DELETE',
  });
  return { res, body: {} };
}

export async function getPrismaStats(app: FastifyInstance) {
  const res = await app.inject({
    url: '/stats',
    method: 'GET',
  });
  const body = (await res.json()) as Static<typeof prismaStatsSchema>;
  return { res, body };
}

export async function createUser(app: FastifyInstance, userData?: { name: string; balance: number }) {
  const defaultUserData = {
    name: `test-user-${Date.now()}`,
    balance: Math.random() * 100
  };
  const res = await app.inject({
    url: '/users',
    method: 'POST',
    payload: userData || defaultUserData,
  });
  const body = (await res.json()) as UserBody;
  return { res, body };
}

export async function createProfile(
  app: FastifyInstance,
  userIdOrProfileData: string | { userId: string; memberTypeId: MemberTypeId; isMale: boolean; yearOfBirth: number },
  memberTypeId?: MemberTypeId,
  isMale?: boolean,
  yearOfBirth?: number
) {
  let profileData: { userId: string; memberTypeId: MemberTypeId; isMale: boolean; yearOfBirth: number };
  
  if (typeof userIdOrProfileData === 'string') {
    profileData = {
      userId: userIdOrProfileData,
      memberTypeId: memberTypeId || MemberTypeId.BASIC,
      isMale: isMale ?? Math.random() > 0.5,
      yearOfBirth: yearOfBirth || 1990 + Math.floor(Math.random() * 30)
    };
  } else {
    profileData = userIdOrProfileData;
  }
  
  const res = await app.inject({
    url: '/profiles',
    method: 'POST',
    payload: profileData,
  });
  const body = (await res.json()) as ProfileBody;
  return { res, body };
}

export async function createPost(app: FastifyInstance, authorIdOrPostData: string | { authorId: string; title: string; content: string }, title?: string, content?: string) {
  let postData: { authorId: string; title: string; content: string };
  
  if (typeof authorIdOrPostData === 'string') {
    postData = {
      authorId: authorIdOrPostData,
      title: title || `Test Post ${Date.now()}`,
      content: content || `Test content for post ${Date.now()}`
    };
  } else {
    postData = authorIdOrPostData;
  }
  
  const res = await app.inject({
    url: '/posts',
    method: 'POST',
    payload: postData,
  });
  const body = (await res.json()) as PostBody;
  return { res, body };
}
