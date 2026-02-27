import { PostConfirmationTriggerEvent } from 'aws-lambda';

jest.mock('../src/s3');
jest.mock('../src/db');

import { createUserPrefix } from '../src/s3';
import { insertUser } from '../src/db';

const mockCreateUserPrefix = jest.mocked(createUserPrefix);
const mockInsertUser = jest.mocked(insertUser);

const makeEvent = (
  attrs: Partial<Record<string, string>> = {},
): PostConfirmationTriggerEvent =>
  ({
    request: {
      userAttributes: {
        sub: 'u1',
        email: 'a@b.com',
        given_name: 'John',
        family_name: 'Doe',
        ...attrs,
      },
    },
  }) as unknown as PostConfirmationTriggerEvent;

beforeEach(() => {
  mockCreateUserPrefix.mockReset();
  mockInsertUser.mockReset();
});

describe('handler', () => {
  it('calls createUserPrefix with userId, givenName, and familyName', async () => {
    mockCreateUserPrefix.mockResolvedValue(undefined);
    mockInsertUser.mockResolvedValue(undefined);
    const { handler } = await import('../src/handler');

    await handler(makeEvent());

    expect(mockCreateUserPrefix).toHaveBeenCalledTimes(1);
    expect(mockCreateUserPrefix).toHaveBeenCalledWith('u1', 'John', 'Doe');
  });

  it('calls insertUser with correct user attributes', async () => {
    mockCreateUserPrefix.mockResolvedValue(undefined);
    mockInsertUser.mockResolvedValue(undefined);
    const { handler } = await import('../src/handler');

    await handler(makeEvent());

    expect(mockInsertUser).toHaveBeenCalledTimes(1);
    expect(mockInsertUser).toHaveBeenCalledWith('u1', 'a@b.com', 'John', 'Doe');
  });

  it('returns the original event unchanged', async () => {
    mockCreateUserPrefix.mockResolvedValue(undefined);
    mockInsertUser.mockResolvedValue(undefined);
    const { handler } = await import('../src/handler');

    const event = makeEvent();
    const result = await handler(event);

    expect(result).toEqual(event);
  });

  it('propagates error when createUserPrefix throws', async () => {
    mockCreateUserPrefix.mockRejectedValue(new Error('S3 failure'));
    mockInsertUser.mockResolvedValue(undefined);
    const { handler } = await import('../src/handler');

    await expect(handler(makeEvent())).rejects.toThrow('S3 failure');
  });

  it('propagates error when insertUser throws', async () => {
    mockCreateUserPrefix.mockResolvedValue(undefined);
    mockInsertUser.mockRejectedValue(new Error('DB failure'));
    const { handler } = await import('../src/handler');

    await expect(handler(makeEvent())).rejects.toThrow('DB failure');
  });
});
