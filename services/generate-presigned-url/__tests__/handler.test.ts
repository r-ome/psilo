import { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('../../shared/db', () => ({
  createDb: jest.fn(),
}));

jest.mock('../../shared/phash', () => ({
  computePHash: jest.fn(),
  hammingDistance: jest.fn(),
}));

jest.mock('../../shared/cloudfront', () => ({
  getPrivateKey: jest.fn(),
  cfSignedUrl: jest.fn(),
}));

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createDb } from '../../shared/db';
import { computePHash, hammingDistance } from '../../shared/phash';
import { getPrivateKey, cfSignedUrl } from '../../shared/cloudfront';
import { handler } from '../src/handler';

const s3Mock = mockClient(S3Client);
const mockGetSignedUrl = jest.mocked(getSignedUrl);
const mockCreateDb = jest.mocked(createDb);
const mockComputePHash = jest.mocked(computePHash);
const mockHammingDistance = jest.mocked(hammingDistance);
const mockGetPrivateKey = jest.mocked(getPrivateKey);
const mockCfSignedUrl = jest.mocked(cfSignedUrl);

const makeEvent = (body: object, sub = 'user-123'): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    body: JSON.stringify(body),
    requestContext: { authorizer: { jwt: { claims: { sub } } } },
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const makeDbMock = (rows: object[] = []) => ({
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockResolvedValue(rows),
});

// Multi-call db mock: first call returns userRow, second returns usageRow
const makeQuotaDbMock = (
  userRow: object | null,
  usageBytes: number,
  photoRows: object[] = [],
) => {
  const mock = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn(),
  };
  let callCount = 0;
  mock.where.mockImplementation(() => {
    callCount++;
    if (callCount === 1) return Promise.resolve(userRow ? [userRow] : []);
    // Usage query only happens when userRow exists and is not on_demand with a limit
    if (userRow && callCount === 2) return Promise.resolve([{ totalBytes: usageBytes }]);
    // pHash query (2nd when no userRow, 3rd when userRow present)
    return Promise.resolve(photoRows);
  });
  return mock;
};

beforeEach(() => {
  s3Mock.reset();
  mockGetSignedUrl.mockReset();
  mockCreateDb.mockReset();
  mockComputePHash.mockReset();
  mockHammingDistance.mockReset();
  mockGetPrivateKey.mockReset();
  mockCfSignedUrl.mockReset();
});

describe('handler', () => {
  describe('validation', () => {
    it('returns 400 when filename is missing', async () => {
      const result = await handler(makeEvent({ contentType: 'image/png' }));
      expect(result).toMatchObject({
        statusCode: 400,
        body: JSON.stringify({ message: 'filename and contentType are required' }),
      });
    });

    it('returns 400 when contentType is missing', async () => {
      const result = await handler(makeEvent({ filename: 'file.txt' }));
      expect(result).toMatchObject({
        statusCode: 400,
        body: JSON.stringify({ message: 'filename and contentType are required' }),
      });
    });

    it('returns 400 when body is empty', async () => {
      const result = await handler(makeEvent({}));
      expect(result).toMatchObject({ statusCode: 400 });
    });
  });

  describe('happy path — no imageData', () => {
    it('returns 200 with status ok, url and key', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned');
      // no user row → quota check skipped
      mockCreateDb.mockReturnValue(makeDbMock([]) as unknown as ReturnType<typeof createDb>);

      const result = await handler(makeEvent({ filename: 'file.txt', contentType: 'image/png' }));

      expect(result).toMatchObject({ statusCode: 200 });
      const body = JSON.parse((result as { body: string }).body);
      expect(body.status).toBe('ok');
      expect(body.url).toBe('https://s3.example.com/presigned');
      expect(body.key).toBe('users/user-123/photos/file.txt');
    });

    it('routes photos to photos/ subdirectory', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned');
      mockCreateDb.mockReturnValue(makeDbMock([]) as unknown as ReturnType<typeof createDb>);

      const result = await handler(
        makeEvent({ filename: 'photo.jpg', contentType: 'image/jpeg' }, 'sub123'),
      );

      const body = JSON.parse((result as { body: string }).body);
      expect(body.key).toBe('users/sub123/photos/photo.jpg');
    });

    it('routes videos to videos/ subdirectory', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned');
      mockCreateDb.mockReturnValue(makeDbMock([]) as unknown as ReturnType<typeof createDb>);

      const result = await handler(
        makeEvent({ filename: 'video.mp4', contentType: 'video/mp4' }, 'sub123'),
      );

      const body = JSON.parse((result as { body: string }).body);
      expect(body.key).toBe('users/sub123/videos/video.mp4');
    });

    it('calls getSignedUrl with correct params for photo', async () => {
      mockGetSignedUrl.mockResolvedValue('https://example.com/url');
      mockCreateDb.mockReturnValue(makeDbMock([]) as unknown as ReturnType<typeof createDb>);

      await handler(makeEvent({ filename: 'file.txt', contentType: 'image/png' }, 'sub123'));

      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
      const calls = mockGetSignedUrl.mock.calls[0] as unknown as [unknown, { input: Record<string, unknown> }, unknown];
      const [, commandArg, optionsArg] = calls;
      expect(commandArg.input).toEqual({
        Bucket: 'test-bucket',
        Key: 'users/sub123/photos/file.txt',
        ContentType: 'image/png',
      });
      expect(optionsArg).toEqual({ expiresIn: 3600 });
    });
  });

  describe('pHash duplicate detection', () => {
    it('returns duplicate when similar photo found', async () => {
      const fakeHash = 'abcdef1234567890';
      mockComputePHash.mockResolvedValue(fakeHash);
      mockHammingDistance.mockReturnValue(2);
      mockGetPrivateKey.mockResolvedValue('private-key');
      mockCfSignedUrl.mockResolvedValue('https://cdn.example.com/thumb.jpg');

      const photoRows = [
        { id: 'photo-1', filename: 'existing.jpg', thumbnailKey: 'users/x/thumbnails/existing.jpg', s3Key: 'users/x/photos/existing.jpg', phash: 'abcdef1234567890' },
      ];
      const dbMock = makeQuotaDbMock(null, 0, photoRows);
      mockCreateDb.mockReturnValue(dbMock as unknown as ReturnType<typeof createDb>);

      const imageData = Buffer.from('fake-image').toString('base64');
      const result = await handler(makeEvent({ filename: 'new.jpg', contentType: 'image/jpeg', imageData }));

      expect(result).toMatchObject({ statusCode: 200 });
      const body = JSON.parse((result as { body: string }).body);
      expect(body.status).toBe('duplicate');
      expect(body.duplicates).toHaveLength(1);
      expect(body.duplicates[0].id).toBe('photo-1');
      expect(body.duplicates[0].distance).toBe(2);
      expect(body.duplicates[0].thumbnailUrl).toBe('https://cdn.example.com/thumb.jpg');
    });

    it('proceeds with upload when no match found', async () => {
      mockComputePHash.mockResolvedValue('abcdef1234567890');
      mockHammingDistance.mockReturnValue(20); // above threshold
      mockGetPrivateKey.mockResolvedValue('private-key');
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned');

      const photoRows = [
        { id: 'photo-1', filename: 'other.jpg', thumbnailKey: 'users/x/thumbnails/other.jpg', s3Key: 'users/x/photos/other.jpg', phash: 'ffffffffffffffff' },
      ];
      const dbMock = makeQuotaDbMock(null, 0, photoRows);
      mockCreateDb.mockReturnValue(dbMock as unknown as ReturnType<typeof createDb>);

      const imageData = Buffer.from('fake-image').toString('base64');
      const result = await handler(makeEvent({ filename: 'new.jpg', contentType: 'image/jpeg', imageData }));

      const body = JSON.parse((result as { body: string }).body);
      expect(body.status).toBe('ok');
      expect(body.url).toBe('https://s3.example.com/presigned');
    });

    it('falls through to normal upload when pHash computation fails', async () => {
      mockComputePHash.mockRejectedValue(new Error('Sharp error'));
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned');
      mockCreateDb.mockReturnValue(makeDbMock([]) as unknown as ReturnType<typeof createDb>);

      const imageData = Buffer.from('fake-image').toString('base64');
      const result = await handler(makeEvent({ filename: 'new.jpg', contentType: 'image/jpeg', imageData }));

      const body = JSON.parse((result as { body: string }).body);
      expect(body.status).toBe('ok');
    });

    it('skips pHash check for video files', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned');
      mockCreateDb.mockReturnValue(makeDbMock([]) as unknown as ReturnType<typeof createDb>);

      const imageData = Buffer.from('fake-image').toString('base64');
      const result = await handler(makeEvent({ filename: 'video.mp4', contentType: 'video/mp4', imageData }));

      expect(mockComputePHash).not.toHaveBeenCalled();
      const body = JSON.parse((result as { body: string }).body);
      expect(body.status).toBe('ok');
    });
  });

  describe('error path', () => {
    it('propagates error when getSignedUrl throws', async () => {
      mockGetSignedUrl.mockRejectedValue(new Error('S3 error'));
      mockCreateDb.mockReturnValue(makeDbMock([]) as unknown as ReturnType<typeof createDb>);

      await expect(
        handler(makeEvent({ filename: 'file.txt', contentType: 'image/png' })),
      ).rejects.toThrow('S3 error');
    });
  });

  describe('quota enforcement', () => {
    it('returns 403 quota_exceeded when usage + contentLength exceeds limit', async () => {
      const userRow = { plan: 'free', storageLimitBytes: 5_368_709_120 };
      const dbMock = makeQuotaDbMock(userRow, 5_200_000_000); // 5.2 GB used
      mockCreateDb.mockReturnValue(dbMock as unknown as ReturnType<typeof createDb>);

      const result = await handler(
        makeEvent({ filename: 'big.jpg', contentType: 'image/jpeg', contentLength: 200_000_000 }), // 200 MB
      );

      expect(result).toMatchObject({ statusCode: 403 });
      const body = JSON.parse((result as { body: string }).body);
      expect(body.status).toBe('quota_exceeded');
      expect(body.currentUsageBytes).toBe(5_200_000_000);
      expect(body.limitBytes).toBe(5_368_709_120);
      expect(body.plan).toBe('free');
    });

    it('allows upload when usage + contentLength is within limit', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned');
      const userRow = { plan: 'free', storageLimitBytes: 5_368_709_120 };
      const dbMock = makeQuotaDbMock(userRow, 100_000_000); // 100 MB used
      mockCreateDb.mockReturnValue(dbMock as unknown as ReturnType<typeof createDb>);

      const result = await handler(
        makeEvent({ filename: 'small.jpg', contentType: 'image/jpeg', contentLength: 5_000_000 }), // 5 MB
      );

      const body = JSON.parse((result as { body: string }).body);
      expect(body.status).toBe('ok');
    });

    it('skips quota check for on_demand plan', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned');
      const userRow = { plan: 'on_demand', storageLimitBytes: null };
      const dbMock = makeQuotaDbMock(userRow, 0);
      mockCreateDb.mockReturnValue(dbMock as unknown as ReturnType<typeof createDb>);

      const result = await handler(
        makeEvent({ filename: 'file.jpg', contentType: 'image/jpeg', contentLength: 999_999_999_999 }),
      );

      const body = JSON.parse((result as { body: string }).body);
      expect(body.status).toBe('ok');
    });

    it('skips quota check when user row not found', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned');
      const dbMock = makeQuotaDbMock(null, 0); // no user row
      mockCreateDb.mockReturnValue(dbMock as unknown as ReturnType<typeof createDb>);

      const result = await handler(
        makeEvent({ filename: 'file.jpg', contentType: 'image/jpeg', contentLength: 999_999_999_999 }),
      );

      const body = JSON.parse((result as { body: string }).body);
      expect(body.status).toBe('ok');
    });

    it('allows upload when contentLength is missing (treats as 0)', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned');
      const userRow = { plan: 'basic', storageLimitBytes: 214_748_364_800 };
      const dbMock = makeQuotaDbMock(userRow, 214_748_364_799); // 1 byte under limit
      mockCreateDb.mockReturnValue(dbMock as unknown as ReturnType<typeof createDb>);

      const result = await handler(
        makeEvent({ filename: 'file.jpg', contentType: 'image/jpeg' }), // no contentLength
      );

      const body = JSON.parse((result as { body: string }).body);
      expect(body.status).toBe('ok');
    });
  });
});
