import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

const s3Mock = mockClient(S3Client);

const mockWhere = jest.fn().mockResolvedValue([]);
const mockSelect = jest.fn(() => ({ from: jest.fn(() => ({ where: mockWhere })) }));
const mockDelete = jest.fn(() => ({ where: mockWhere }));

const mockDb = { select: mockSelect, delete: mockDelete };

jest.mock('../../shared/db', () => ({
  createDb: jest.fn(() => mockDb),
}));

jest.mock('../../shared/schema', () => ({
  photos: 'photos_table',
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/signed-url'),
}));

function makeEvent(
  method: string,
  routeKey: string,
  sub: string,
  pathParameters?: Record<string, string>,
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
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

async function callHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const { handler } = await import('../src/handler');
  return handler(event) as Promise<APIGatewayProxyStructuredResultV2>;
}

beforeEach(() => {
  s3Mock.reset();
  mockWhere.mockReset().mockResolvedValue([]);
  mockSelect.mockClear();
  mockDelete.mockClear();
});

describe('manage-photos handler', () => {
  describe('GET /photos', () => {
    it('returns list of photos with signedUrl for the user', async () => {
      const photos = [{ id: 'p1', userId: 'u1', s3Key: 'users/u1/photo.jpg' }];
      mockWhere.mockResolvedValueOnce(photos);

      const result = await callHandler(makeEvent('GET', 'GET /photos', 'u1'));

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body as string)).toEqual([
        { ...photos[0], signedUrl: 'https://s3.example.com/signed-url' },
      ]);
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe('DELETE /photos/{key+}', () => {
    it('deletes photo from S3 and DB', async () => {
      s3Mock.on(DeleteObjectCommand).resolves({});
      mockWhere.mockResolvedValueOnce([]);

      // sub is 'u1' padded to simulate a 36-char UUID as the last part of the segment
      const sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const key = `users/John-Doe-${sub}/photo.jpg`;

      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /photos/{key+}', sub, { 'key+': key }),
      );

      expect(result.statusCode).toBe(200);
      const s3Calls = s3Mock.commandCalls(DeleteObjectCommand);
      expect(s3Calls).toHaveLength(1);
      expect(s3Calls[0].args[0].input).toMatchObject({ Key: key });
      expect(mockDelete).toHaveBeenCalledWith('photos_table');
    });

    it('returns 403 when key does not belong to user', async () => {
      // sub is 'u1' (36 chars not matching), userSegment ends with a different userId
      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /photos/{key+}', 'u1', {
          // Last 36 chars of userSegment = 'other-user-000000000000000000000000'
          'key+': 'users/John-Doe-000000000000000000000000000000000000/photo.jpg',
        }),
      );

      expect(result.statusCode).toBe(403);
      expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(0);
    });

    it('returns 400 when key is missing', async () => {
      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /photos/{key+}', 'u1'),
      );

      expect(result.statusCode).toBe(400);
    });
  });

  describe('unsupported method', () => {
    it('returns 405', async () => {
      const result = await callHandler(makeEvent('PATCH', 'PATCH /photos', 'u1'));
      expect(result.statusCode).toBe(405);
    });
  });
});
