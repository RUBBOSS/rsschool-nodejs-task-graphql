// Simple data generators for tests
import { MemberTypeId } from '../../src/routes/member-types/schemas.js';

export function genCreateUserDto() {
  return {
    name: `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    balance: Math.round(Math.random() * 100 * 100) / 100 // Random balance between 0-100 with 2 decimal places
  };
}

export function genCreateProfileDto(userId) {
  return {
    userId,
    memberTypeId: MemberTypeId.BASIC,
    isMale: Math.random() > 0.5,
    yearOfBirth: 1990 + Math.floor(Math.random() * 30) // Random year between 1990-2020
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
