import { S3Event } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3Mock = mockClient(S3Client);

const mockOnConflictDoNothing = jest.fn().mockResolvedValue([]);
const mockValues = jest.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
const mockInsert = jest.fn(() => ({ values: mockValues }));
const mockDb = { insert: mockInsert };

jest.mock('../../shared/db', () => ({
  createDb: jest.fn(() => mockDb),
}));

jest.mock('../../shared/schema', () => ({
  photos: 'photos_table',
}));

jest.mock('sharp', () => {
  return jest.fn(() => ({
    metadata: jest.fn().mockResolvedValue({
      width: 1920,
      height: 1080,
      format: 'jpeg',
    }),
  }));
});

function makeS3Event(key: string, size = 12345): S3Event {
  return {
    Records: [
      {
        s3: {
          bucket: { name: 'test-bucket' },
          object: { key, size },
        },
      } as unknown as S3Event['Records'][0],
    ],
  };
}

function makeS3Body(): Readable {
  const stream = new Readable();
  stream.push(Buffer.from('fake-image-data'));
  stream.push(null);
  return stream;
}

beforeEach(() => {
  s3Mock.reset();
  mockInsert.mockClear();
  mockValues.mockClear();
  mockOnConflictDoNothing.mockClear();
});

describe('process-photo-metadata handler', () => {
  it('skips folder marker objects (keys ending with /)', async () => {
    const { handler } = await import('../src/handler');
    await handler(makeS3Event('users/u1/'));

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('skips keys that do not start with users/', async () => {
    const { handler } = await import('../src/handler');
    await handler(makeS3Event('other/key/photo.jpg'));

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('downloads the object from S3 and extracts metadata', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
      ContentType: 'image/jpeg',
    });

    const { handler } = await import('../src/handler');
    await handler(makeS3Event('users/u1/photo.jpg'));

    const calls = s3Mock.commandCalls(GetObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'users/u1/photo.jpg',
    });
  });

  it('inserts photo metadata into the database', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
      ContentType: 'image/jpeg',
    });

    const { handler } = await import('../src/handler');
    await handler(makeS3Event('users/u1/photo.jpg', 12345));

    expect(mockInsert).toHaveBeenCalledWith('photos_table');
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        s3Key: 'users/u1/photo.jpg',
        filename: 'photo.jpg',
        size: 12345,
        width: 1920,
        height: 1080,
        format: 'jpeg',
        contentType: 'image/jpeg',
      }),
    );
  });

  it('does not throw when S3 download fails', async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error('S3 error'));

    const { handler } = await import('../src/handler');
    await expect(handler(makeS3Event('users/u1/photo.jpg'))).resolves.toBeUndefined();
  });
});
