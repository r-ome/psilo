import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';
import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

const s3Mock = mockClient(S3Client);

const mockLimit = jest.fn().mockResolvedValue([]);
const mockOrderBy = jest.fn(() => ({ limit: mockLimit }));
const mockSelectWhereData: unknown[][] = [];
const mockSelectWhere = jest.fn(() => {
  const data = mockSelectWhereData.shift() ?? [];
  const result = Promise.resolve(data);
  (result as unknown as Record<string, unknown>).orderBy = mockOrderBy;
  return result;
});
const mockReturning = jest.fn().mockResolvedValue([]);
const mockUpdateWhere = jest.fn(() => ({ returning: mockReturning }));
const mockSet = jest.fn(() => ({ where: mockUpdateWhere }));
const mockSelect = jest.fn(() => ({ from: jest.fn(() => ({ where: mockSelectWhere })) }));
const mockDeleteWhere = jest.fn().mockResolvedValue([]);
const mockDelete = jest.fn(() => ({ where: mockDeleteWhere }));
const mockUpdate = jest.fn(() => ({ set: mockSet }));

const mockDb = { select: mockSelect, delete: mockDelete, update: mockUpdate };

jest.mock('../../shared/db', () => ({
  createDb: jest.fn(() => mockDb),
}));

jest.mock('../../shared/schema', () => ({
  photos: 'photos_table',
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  and: jest.fn((...args) => ({ and: args })),
  desc: jest.fn((col) => ({ desc: col })),
  or: jest.fn((...args) => ({ or: args })),
  lt: jest.fn((col, val) => ({ col, val })),
  sql: jest.fn((strings, ...values) => ({ sql: strings, values })),
  inArray: jest.fn((col, vals) => ({ inArray: { col, vals } })),
  isNull: jest.fn((col) => ({ isNull: col })),
  isNotNull: jest.fn((col) => ({ isNotNull: col })),
}));

const mockCfSignedUrl = jest.fn();
const mockGetPrivateKey = jest.fn().mockResolvedValue('fake-private-key');
jest.mock('../../shared/cloudfront', () => ({
  getPrivateKey: mockGetPrivateKey,
  cfSignedUrl: mockCfSignedUrl,
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

function makeEvent(
  method: string,
  routeKey: string,
  sub: string,
  pathParameters?: Record<string, string>,
  body?: unknown,
  rawPath?: string,
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    requestContext: {
      http: { method },
      authorizer: {
        jwt: { claims: { sub } },
      },
      routeKey,
    },
    pathParameters,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    rawPath,
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

async function callHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const { handler } = await import('../src/handler');
  return handler(event) as Promise<APIGatewayProxyStructuredResultV2>;
}

beforeEach(() => {
  s3Mock.reset();
  mockLimit.mockReset().mockResolvedValue([]);
  mockOrderBy.mockReset().mockImplementation(() => ({ limit: mockLimit }));
  mockDeleteWhere.mockReset().mockResolvedValue([]);
  mockReturning.mockReset().mockResolvedValue([]);
  mockSelect.mockClear();
  mockDelete.mockClear();
  mockUpdate.mockClear();
  mockSet.mockClear();
  mockSelectWhere.mockClear();
  mockSelectWhereData.length = 0;
  mockUpdateWhere.mockClear();
  mockCfSignedUrl.mockReset().mockResolvedValue('https://xxx.cloudfront.net/signed-url');
  mockGetPrivateKey.mockReset().mockResolvedValue('fake-private-key');
  process.env.USE_CLOUDFRONT = 'true';
});

describe('manage-photos handler', () => {
  describe('GET /photos', () => {
    it('returns paginated photos with only thumbnailUrl for the user', async () => {
      const photos = [{ id: 'p1', userId: 'u1', s3Key: 'users/u1/photos/photo.jpg', thumbnailKey: 'users/u1/thumbnails/photo.jpg', takenAt: null, createdAt: new Date().toISOString(), contentType: 'image/jpeg' }];
      mockLimit.mockResolvedValueOnce(photos);

      const result = await callHandler(makeEvent('GET', 'GET /photos', 'u1'));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body).toEqual({
        photos: [
          { ...photos[0], thumbnailUrl: 'https://xxx.cloudfront.net/signed-url' },
        ],
        nextCursor: null,
      });
      expect(mockSelect).toHaveBeenCalledTimes(1);
      expect(mockCfSignedUrl).toHaveBeenCalledTimes(1); // only for thumbnailKey
    });

    it('returns nextCursor when more rows exist', async () => {
      const photos = Array.from({ length: 31 }, (_, i) => ({
        id: `p${i}`,
        userId: 'u1',
        s3Key: `users/u1/photos/photo${i}.jpg`,
        thumbnailKey: `users/u1/thumbnails/photo${i}.jpg`,
        takenAt: null,
        createdAt: new Date(Date.now() - i * 1000).toISOString(),
      }));
      mockLimit.mockResolvedValueOnce(photos);

      const result = await callHandler(makeEvent('GET', 'GET /photos', 'u1'));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.photos.length).toBeGreaterThan(0);
      expect(body.nextCursor).toBeTruthy();

      // Verify cursor can be decoded
      const decodedCursor = JSON.parse(Buffer.from(body.nextCursor, 'base64').toString('utf-8'));
      expect(decodedCursor.sortDate).toBeTruthy();
      expect(decodedCursor.id).toBeTruthy();
    });

    it('returns thumbnailUrl as null for photos without thumbnail', async () => {
      const photos = [{ id: 'p1', userId: 'u1', s3Key: 'users/u1/photos/photo.jpg', thumbnailKey: null, takenAt: null, createdAt: new Date().toISOString(), contentType: 'image/jpeg' }];
      mockLimit.mockResolvedValueOnce(photos);

      const result = await callHandler(makeEvent('GET', 'GET /photos', 'u1'));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.photos[0].thumbnailUrl).toBeNull();
      expect(mockCfSignedUrl).not.toHaveBeenCalled(); // no signed URL needed
    });

    it('returns signedUrl for videos (actual object, no thumbnails yet)', async () => {
      const photos = [{ id: 'v1', userId: 'u1', s3Key: 'users/u1/videos/video.mp4', thumbnailKey: null, takenAt: null, createdAt: new Date().toISOString(), contentType: 'video/mp4' }];
      mockLimit.mockResolvedValueOnce(photos);

      const result = await callHandler(makeEvent('GET', 'GET /photos', 'u1'));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.photos[0].signedUrl).toBe('https://xxx.cloudfront.net/signed-url'); // signed URL for actual video
      expect(body.photos[0].thumbnailUrl).toBeNull(); // no thumbnail for videos
      expect(mockCfSignedUrl).toHaveBeenCalledTimes(1); // once for video s3Key
    });
  });

  describe('GET /photos/trash', () => {
    it('returns paginated deleted photos with thumbnailUrl for the user', async () => {
      const photos = [{ id: 'p1', userId: 'u1', s3Key: 'users/u1/photos/photo.jpg', thumbnailKey: 'users/u1/thumbnails/photo.jpg', takenAt: null, createdAt: new Date().toISOString(), contentType: 'image/jpeg', deletedAt: new Date().toISOString() }];
      mockLimit.mockResolvedValueOnce(photos);

      const result = await callHandler(makeEvent('GET', 'GET /photos/trash', 'u1', undefined, undefined, '/photos/trash'));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body).toEqual({
        photos: [
          { ...photos[0], thumbnailUrl: 'https://xxx.cloudfront.net/signed-url' },
        ],
        nextCursor: null,
      });
      expect(mockSelect).toHaveBeenCalledTimes(1);
      expect(mockCfSignedUrl).toHaveBeenCalledTimes(1); // only for thumbnailKey
    });

    it('returns empty array when no deleted photos exist', async () => {
      mockLimit.mockResolvedValueOnce([]);

      const result = await callHandler(makeEvent('GET', 'GET /photos/trash', 'u1', undefined, undefined, '/photos/trash'));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.photos).toEqual([]);
      expect(body.nextCursor).toBeNull();
    });

    it('returns nextCursor when more deleted photos exist', async () => {
      const photos = Array.from({ length: 31 }, (_, i) => ({
        id: `p${i}`,
        userId: 'u1',
        s3Key: `users/u1/photos/photo${i}.jpg`,
        thumbnailKey: `users/u1/thumbnails/photo${i}.jpg`,
        takenAt: null,
        createdAt: new Date(Date.now() - i * 1000).toISOString(),
        deletedAt: new Date().toISOString(),
      }));
      mockLimit.mockResolvedValueOnce(photos);

      const result = await callHandler(makeEvent('GET', 'GET /photos/trash', 'u1', undefined, undefined, '/photos/trash'));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.photos.length).toBeGreaterThan(0);
      expect(body.nextCursor).toBeTruthy();
    });
  });

  describe('DELETE /photos/{key+}', () => {
    const sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    it('soft-deletes photo (sets deletedAt, no S3 deletion)', async () => {
      const key = `users/John-Doe-${sub}/photos/photo.jpg`;

      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /photos/{key+}', sub, { key }),
      );

      expect(result.statusCode).toBe(200);
      // No S3 delete calls
      expect(s3Mock.calls()).toHaveLength(0);
      // DB update with deletedAt
      expect(mockUpdate).toHaveBeenCalledWith('photos_table');
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date) }));
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('soft-deletes multiple photos in bulk', async () => {
      const keys = [
        `users/John-Doe-${sub}/photos/photo1.jpg`,
        `users/John-Doe-${sub}/photos/photo2.jpg`,
      ];

      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /photos', sub, undefined, { keys }),
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body as string)).toEqual({ message: 'Photos deleted' });
      expect(mockUpdate).toHaveBeenCalledWith('photos_table');
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: expect.any(Date) }));
    });

    it('returns 403 when key does not belong to user', async () => {
      const key = `users/John-Doe-000000000000000000000000000000000000/photos/photo.jpg`;
      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /photos/{key+}', sub, { key }),
      );

      expect(result.statusCode).toBe(403);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('returns 403 when any key in bulk delete does not belong to user', async () => {
      const keys = [
        `users/John-Doe-${sub}/photos/photo1.jpg`,
        `users/John-Doe-000000000000000000000000000000000000/photos/photo2.jpg`,
      ];

      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /photos', sub, undefined, { keys }),
      );

      expect(result.statusCode).toBe(403);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('returns 400 when key is missing', async () => {
      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /photos/{key+}', sub),
      );

      expect(result.statusCode).toBe(400);
    });
  });

  describe('PATCH /photos/{key+}', () => {
    const sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const key = `users/John-Doe-${sub}/photos/photo.jpg`;

    it('updates takenAt for the photo', async () => {
      const updatedPhoto = { id: 'p1', s3Key: key, takenAt: '2024-01-01T00:00:00.000Z' };
      mockReturning.mockResolvedValueOnce([updatedPhoto]);

      const result = await callHandler(
        makeEvent('PATCH', 'PATCH /photos/{key+}', sub, { key }, { takenAt: '2024-01-01T00:00:00.000Z' }),
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body as string)).toEqual(updatedPhoto);
      expect(mockUpdate).toHaveBeenCalledWith('photos_table');
    });

    it('returns 403 when key does not belong to user', async () => {
      const result = await callHandler(
        makeEvent('PATCH', 'PATCH /photos/{key+}', 'u1', {
          key: 'users/John-Doe-000000000000000000000000000000000000/photos/photo.jpg',
        }, { takenAt: null }),
      );

      expect(result.statusCode).toBe(403);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('returns 400 when key is missing', async () => {
      const result = await callHandler(
        makeEvent('PATCH', 'PATCH /photos/{key+}', sub, undefined, { takenAt: null }),
      );

      expect(result.statusCode).toBe(400);
    });

    it('updates takenAt for multiple photos in bulk', async () => {
      const keys = [
        `users/John-Doe-${sub}/photos/photo1.jpg`,
        `users/John-Doe-${sub}/photos/photo2.jpg`,
      ];

      const result = await callHandler(
        makeEvent('PATCH', 'PATCH /photos', sub, undefined, { keys, takenAt: '2024-01-01T00:00:00.000Z' }),
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body as string)).toEqual({ message: 'Photos updated' });
      expect(mockUpdate).toHaveBeenCalledWith('photos_table');
    });

    it('returns 403 when any key in bulk update does not belong to user', async () => {
      const keys = [
        `users/John-Doe-${sub}/photos/photo1.jpg`,
        `users/John-Doe-000000000000000000000000000000000000/photos/photo2.jpg`,
      ];

      const result = await callHandler(
        makeEvent('PATCH', 'PATCH /photos', sub, undefined, { keys, takenAt: '2024-01-01T00:00:00.000Z' }),
      );

      expect(result.statusCode).toBe(403);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('POST /photos/trash/restore', () => {
    const sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    it('restores deleted photos (sets deletedAt to null)', async () => {
      const keys = [
        `users/John-Doe-${sub}/photos/photo1.jpg`,
        `users/John-Doe-${sub}/photos/photo2.jpg`,
      ];

      const result = await callHandler(
        makeEvent('POST', 'POST /photos/trash/restore', sub, undefined, { keys }, '/photos/trash/restore'),
      );

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body as string)).toEqual({ message: 'Photos restored' });
      expect(mockUpdate).toHaveBeenCalledWith('photos_table');
      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: null }));
    });

    it('returns 403 when any key does not belong to user', async () => {
      const keys = [
        `users/John-Doe-${sub}/photos/photo1.jpg`,
        `users/John-Doe-000000000000000000000000000000000000/photos/photo2.jpg`,
      ];

      const result = await callHandler(
        makeEvent('POST', 'POST /photos/trash/restore', sub, undefined, { keys }, '/photos/trash/restore'),
      );

      expect(result.statusCode).toBe(403);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('returns 400 when body is invalid', async () => {
      const result = await callHandler(
        makeEvent('POST', 'POST /photos/trash/restore', sub, undefined, { invalid: true }, '/photos/trash/restore'),
      );

      expect(result.statusCode).toBe(400);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /photos/trash (permanent delete)', () => {
    const sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

    it('permanently deletes photos from S3 and DB', async () => {
      const keys = [
        `users/John-Doe-${sub}/photos/photo1.jpg`,
        `users/John-Doe-${sub}/photos/photo2.jpg`,
      ];
      const dbPhotos = [
        { id: 'p1', s3Key: keys[0], thumbnailKey: `users/John-Doe-${sub}/thumbnails/photo1.jpg` },
        { id: 'p2', s3Key: keys[1], thumbnailKey: null },
      ];
      mockSelectWhereData.push(dbPhotos);

      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /photos/trash', sub, undefined, { keys }, '/photos/trash'),
      );

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body).toEqual({ message: 'Photos permanently deleted', count: 2 });
      // S3 delete should have been called
      expect(s3Mock.calls()).toHaveLength(1);
      // DB hard delete should have been called
      expect(mockDelete).toHaveBeenCalledWith('photos_table');
    });

    it('returns 403 when any key does not belong to user', async () => {
      const keys = [
        `users/John-Doe-${sub}/photos/photo1.jpg`,
        `users/John-Doe-000000000000000000000000000000000000/photos/photo2.jpg`,
      ];

      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /photos/trash', sub, undefined, { keys }, '/photos/trash'),
      );

      expect(result.statusCode).toBe(403);
      expect(mockSelect).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('returns 400 when body is missing keys', async () => {
      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /photos/trash', sub, undefined, { invalid: true }, '/photos/trash'),
      );

      expect(result.statusCode).toBe(400);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it('returns count 0 when no matching trashed photos found', async () => {
      const keys = [`users/John-Doe-${sub}/photos/photo1.jpg`];
      mockSelectWhereData.push([]);

      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /photos/trash', sub, undefined, { keys }, '/photos/trash'),
      );

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.count).toBe(0);
      expect(s3Mock.calls()).toHaveLength(0);
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('unsupported method', () => {
    it('returns 405', async () => {
      const result = await callHandler(makeEvent('PUT', 'PUT /photos', 'u1'));
      expect(result.statusCode).toBe(405);
    });
  });
});
