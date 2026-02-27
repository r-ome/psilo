import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

const mockReturning = jest.fn().mockResolvedValue([{ id: 'a1', name: 'My Album', userId: 'u1' }]);
const mockOnConflictDoNothing = jest.fn().mockResolvedValue([]);
const mockInsertValues = jest.fn(() => ({ returning: mockReturning, onConflictDoNothing: mockOnConflictDoNothing }));
const mockInsert = jest.fn(() => ({ values: mockInsertValues }));

const mockDeleteWhere = jest.fn().mockResolvedValue([]);
const mockDelete = jest.fn(() => ({ where: mockDeleteWhere }));

const mockSelectWhere = jest.fn().mockResolvedValue([]);
const mockInnerJoin = jest.fn(() => ({ where: mockSelectWhere }));
const mockFrom = jest.fn(() => ({ where: mockSelectWhere, innerJoin: mockInnerJoin }));
const mockSelect = jest.fn(() => ({ from: mockFrom }));

const mockDb = {
  insert: mockInsert,
  delete: mockDelete,
  select: mockSelect,
};

jest.mock('../../shared/db', () => ({
  createDb: jest.fn(() => mockDb),
}));

jest.mock('../../shared/schema', () => ({
  albums: 'albums_table',
  albumPhotos: 'album_photos_table',
  photos: 'photos_table',
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
  and: jest.fn((...args) => ({ and: args })),
}));

function makeEvent(
  method: string,
  routeKey: string,
  sub: string,
  pathParameters?: Record<string, string>,
  body?: unknown,
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    routeKey,
    requestContext: {
      http: { method },
      authorizer: {
        jwt: { claims: { sub } },
      },
    },
    pathParameters,
    body: body ? JSON.stringify(body) : undefined,
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

async function callHandler(event: APIGatewayProxyEventV2WithJWTAuthorizer) {
  const { handler } = await import('../src/handler');
  return handler(event) as Promise<APIGatewayProxyStructuredResultV2>;
}

beforeEach(() => {
  mockInsert.mockClear();
  mockInsertValues.mockClear();
  mockReturning.mockClear().mockResolvedValue([{ id: 'a1', name: 'My Album', userId: 'u1' }]);
  mockOnConflictDoNothing.mockClear().mockResolvedValue([]);
  mockDelete.mockClear();
  mockDeleteWhere.mockClear().mockResolvedValue([]);
  mockSelect.mockClear();
  mockFrom.mockClear();
  mockSelectWhere.mockClear().mockResolvedValue([]);
  mockInnerJoin.mockClear();
});

describe('manage-albums handler', () => {
  describe('POST /albums', () => {
    it('creates an album and returns 201', async () => {
      const result = await callHandler(
        makeEvent('POST', 'POST /albums', 'u1', undefined, { name: 'Vacation' }),
      );

      expect(result.statusCode).toBe(201);
      expect(mockInsert).toHaveBeenCalledWith('albums_table');
      expect(mockInsertValues).toHaveBeenCalledWith({ userId: 'u1', name: 'Vacation' });
    });

    it('returns 400 when name is missing', async () => {
      const result = await callHandler(
        makeEvent('POST', 'POST /albums', 'u1', undefined, {}),
      );
      expect(result.statusCode).toBe(400);
    });
  });

  describe('GET /albums', () => {
    it('returns list of albums', async () => {
      const userAlbums = [{ id: 'a1', name: 'Test', userId: 'u1' }];
      mockSelectWhere.mockResolvedValueOnce(userAlbums);

      const result = await callHandler(makeEvent('GET', 'GET /albums', 'u1'));

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body as string)).toEqual(userAlbums);
    });
  });

  describe('GET /albums/{albumId}', () => {
    it('returns 404 when album not found', async () => {
      mockSelectWhere.mockResolvedValueOnce([]);

      const result = await callHandler(
        makeEvent('GET', 'GET /albums/{albumId}', 'u1', { albumId: 'a1' }),
      );

      expect(result.statusCode).toBe(404);
    });

    it('returns album with photos when found', async () => {
      const album = { id: 'a1', name: 'Test', userId: 'u1' };
      mockSelectWhere
        .mockResolvedValueOnce([album])
        .mockResolvedValueOnce([{ photo: { id: 'p1', filename: 'pic.jpg' } }]);

      const result = await callHandler(
        makeEvent('GET', 'GET /albums/{albumId}', 'u1', { albumId: 'a1' }),
      );

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.id).toBe('a1');
    });
  });

  describe('POST /albums/{albumId}/photos', () => {
    it('returns 404 when album not found', async () => {
      mockSelectWhere.mockResolvedValueOnce([]);

      const result = await callHandler(
        makeEvent('POST', 'POST /albums/{albumId}/photos', 'u1', { albumId: 'a1' }, { photoId: 'p1' }),
      );

      expect(result.statusCode).toBe(404);
    });

    it('adds photo to album and returns 201', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 'a1', userId: 'u1' }]);

      const result = await callHandler(
        makeEvent('POST', 'POST /albums/{albumId}/photos', 'u1', { albumId: 'a1' }, { photoId: 'p1' }),
      );

      expect(result.statusCode).toBe(201);
      expect(mockInsert).toHaveBeenCalledWith('album_photos_table');
    });
  });

  describe('DELETE /albums/{albumId}/photos/{photoId}', () => {
    it('removes photo from album and returns 200', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 'a1', userId: 'u1' }]);

      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /albums/{albumId}/photos/{photoId}', 'u1', {
          albumId: 'a1',
          photoId: 'p1',
        }),
      );

      expect(result.statusCode).toBe(200);
      expect(mockDelete).toHaveBeenCalledWith('album_photos_table');
    });

    it('returns 404 when album not found', async () => {
      mockSelectWhere.mockResolvedValueOnce([]);

      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /albums/{albumId}/photos/{photoId}', 'u1', {
          albumId: 'a1',
          photoId: 'p1',
        }),
      );

      expect(result.statusCode).toBe(404);
    });
  });

  describe('unsupported route', () => {
    it('returns 405', async () => {
      const result = await callHandler(makeEvent('PUT', 'PUT /albums', 'u1'));
      expect(result.statusCode).toBe(405);
    });
  });
});
