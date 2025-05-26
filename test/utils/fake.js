// Simple data generators for tests
import { MemberTypeId } from '../../src/routes/member-types/schemas.js';

export function genCreateUserDto() {
  return {
    name: `test-user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    balance: Math.round(Math.random() * 100 * 100) / 100 
  };
}

export function genCreateProfileDto(userId) {
  return {
    userId,
    memberTypeId: MemberTypeId.BASIC,
    isMale: Math.random() > 0.5,
    yearOfBirth: 1990 + Math.floor(Math.random() * 30)
  };
}

export function genCreatePostDto(authorId) {
  const timestamp = Date.now();
  return {
    authorId,
    title: `Test Post Title ${timestamp}`,
    content: `This is test content for post created at ${timestamp}. Lorem ipsum dolor sit amet.`
  };
}
