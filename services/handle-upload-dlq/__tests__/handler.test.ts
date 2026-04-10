import { SQSEvent, SQSBatchResponse } from 'aws-lambda';

const mockWhere = jest.fn().mockResolvedValue([]);
const mockSet = jest.fn(() => ({ where: mockWhere }));
const mockUpdate = jest.fn(() => ({ set: mockSet }));
const mockDb = { update: mockUpdate };

jest.mock('../../shared/db', () => ({
  createDb: jest.fn(() => mockDb),
}));

jest.mock('../../shared/schema', () => ({
  photos: 'photos_table',
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col: unknown, val: unknown) => ({ col, val })),
}));

function makeSqsEvent(key: string, messageId = 'msg-1'): SQSEvent {
  const s3Event = {
    Records: [
      {
        s3: {
          object: { key },
        },
      },
    ],
  };
  return {
    Records: [
      {
        messageId,
        body: JSON.stringify(s3Event),
      } as SQSEvent['Records'][0],
    ],
  };
}

beforeEach(() => {
  mockUpdate.mockClear();
  mockSet.mockClear();
  mockWhere.mockClear();
});

describe('handle-upload-dlq handler', () => {
  it('marks photo as failed in the database', async () => {
    const { handler } = await import('../src/handler');
    const result = await handler(makeSqsEvent('users/u1/photo.jpg')) as SQSBatchResponse;

    expect(mockUpdate).toHaveBeenCalledWith('photos_table');
    expect(mockSet).toHaveBeenCalledWith({ status: 'failed' });
    expect(mockWhere).toHaveBeenCalled();
    expect(result.batchItemFailures).toHaveLength(0);
  });

  it('skips records with missing S3 record and logs warning', async () => {
    const { handler } = await import('../src/handler');
    const event: SQSEvent = {
      Records: [
        {
          messageId: 'msg-2',
          body: JSON.stringify({ Records: [] }),
        } as SQSEvent['Records'][0],
      ],
    };
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await handler(event) as SQSBatchResponse;

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Missing S3 record'), 'msg-2');
    expect(result.batchItemFailures).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  it('returns batchItemFailures when DB update fails', async () => {
    mockWhere.mockRejectedValueOnce(new Error('DB error'));
    const { handler } = await import('../src/handler');
    const result = await handler(makeSqsEvent('users/u1/photo.jpg', 'msg-3')) as SQSBatchResponse;

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-3' }]);
  });

  it('drops unparsable DLQ payloads without retrying them', async () => {
    const { handler } = await import('../src/handler');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const event: SQSEvent = {
      Records: [
        {
          messageId: 'msg-4',
          body: '{"Records":[{"s3":{"object":{"key":"bad\nkey.jpg"}}}]}',
        } as SQSEvent['Records'][0],
      ],
    };

    const result = await handler(event) as SQSBatchResponse;

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.batchItemFailures).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Dropping unparsable DLQ message',
      expect.objectContaining({
        messageId: 'msg-4',
        bodyPreview: expect.stringContaining('bad'),
        err: expect.any(SyntaxError),
      }),
    );
    consoleSpy.mockRestore();
  });
});
