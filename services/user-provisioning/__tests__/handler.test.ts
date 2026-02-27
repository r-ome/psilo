import { PostConfirmationTriggerEvent } from 'aws-lambda';

jest.mock('../src/s3');

import { createUserPrefix } from '../src/s3';

const mockCreateUserPrefix = jest.mocked(createUserPrefix);

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
});

describe('handler', () => {
  it('calls createUserPrefix with userId, givenName, and familyName', async () => {
    mockCreateUserPrefix.mockResolvedValue(undefined);
    const { handler } = await import('../src/handler');

    await handler(makeEvent());

    expect(mockCreateUserPrefix).toHaveBeenCalledTimes(1);
    expect(mockCreateUserPrefix).toHaveBeenCalledWith('u1', 'John', 'Doe');
  });

  it('returns the original event unchanged', async () => {
    mockCreateUserPrefix.mockResolvedValue(undefined);
    const { handler } = await import('../src/handler');

    const event = makeEvent();
    const result = await handler(event);

    expect(result).toEqual(event);
  });

  it('propagates error when createUserPrefix throws', async () => {
    mockCreateUserPrefix.mockRejectedValue(new Error('S3 failure'));
    const { handler } = await import('../src/handler');

    await expect(handler(makeEvent())).rejects.toThrow('S3 failure');
  });
});
