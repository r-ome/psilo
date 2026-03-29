const mockOnConflictDoNothing = jest.fn().mockResolvedValue([]);
const mockValues = jest.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
const mockInsert = jest.fn(() => ({ values: mockValues }));
const mockDb = { insert: mockInsert };

jest.mock('../../shared/db', () => ({
  createDb: jest.fn(() => mockDb),
}));

jest.mock('../../shared/schema', () => ({
  users: 'users_table',
}));

import { insertUser } from '../src/db';

beforeEach(() => {
  mockInsert.mockClear();
  mockValues.mockClear();
  mockOnConflictDoNothing.mockClear();
});

describe('insertUser', () => {
  it('calls db.insert with users table', async () => {
    await insertUser('u1', 'a@b.com', 'John', 'Doe');
    expect(mockInsert).toHaveBeenCalledWith('users_table');
  });

  it('calls values with the correct user data', async () => {
    await insertUser('u1', 'a@b.com', 'John', 'Doe');
    expect(mockValues).toHaveBeenCalledWith({
      id: 'u1',
      email: 'a@b.com',
      givenName: 'John',
      familyName: 'Doe',
      plan: 'free',
      storageLimitBytes: 5368709120,
    });
  });

  it('calls onConflictDoNothing', async () => {
    await insertUser('u1', 'a@b.com', 'John', 'Doe');
    expect(mockOnConflictDoNothing).toHaveBeenCalledTimes(1);
  });
});
