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

const mockUpdateSetWhere = jest.fn().mockResolvedValue([]);
const mockUpdateSet = jest.fn(() => ({ where: mockUpdateSetWhere }));
const mockUpdate = jest.fn(() => ({ set: mockUpdateSet }));

const mockLimit = jest.fn().mockResolvedValue([]);
const mockOrderBy = jest.fn(function() {
  const result = Promise.resolve([]) as any;
  result.limit = mockLimit;
  return result;
});
const mockSelectWhere = jest.fn().mockResolvedValue([]);
// mockWhereForCover needs to return { orderBy } but also be thenable for other routes
const mockWhereForCover = jest.fn(function() {
  // Return both orderBy and make it awaitable as a Promise
  const result = Promise.resolve([]) as any;
  result.orderBy = mockOrderBy;
  return result;
});
const mockInnerJoin = jest.fn(() => ({ where: mockWhereForCover }));
const mockFrom = jest.fn(() => ({ where: mockSelectWhere, innerJoin: mockInnerJoin }));
const mockSelect = jest.fn(() => ({ from: mockFrom }));
const mockEq = jest.fn((col, val) => ({ col, val }));
const mockAnd = jest.fn((...args) => ({ and: args }));
const mockOr = jest.fn((...args) => ({ or: args }));
const mockLt = jest.fn((col, val) => ({ col, val }));
const mockSql = jest.fn((strings, ...values) => ({ sql: strings, values }));
const mockInArray = jest.fn((col, vals) => ({ inArray: { col, vals } }));
const mockDesc = jest.fn((col) => ({ desc: col }));
const mockIsNotNull = jest.fn((col) => ({ isNotNull: col }));
const mockIsNull = jest.fn((col) => ({ isNull: col }));

const mockDb = {
  insert: mockInsert,
  delete: mockDelete,
  select: mockSelect,
  update: mockUpdate,
};

jest.mock('../../shared/db', () => ({
  createDb: jest.fn(() => mockDb),
}));

jest.mock('../../shared/schema', () => ({
  albums: {
    id: 'albums_table.id',
    userId: 'albums_table.userId',
    name: 'albums_table.name',
  },
  albumPhotos: {
    albumId: 'album_photos_table.albumId',
    photoId: 'album_photos_table.photoId',
    addedAt: 'album_photos_table.addedAt',
  },
  photos: {
    id: 'photos_table.id',
    userId: 'photos_table.userId',
    deletedAt: 'photos_table.deletedAt',
    thumbnailKey: 'photos_table.thumbnailKey',
    status: 'photos_table.status',
    takenAt: 'photos_table.takenAt',
    createdAt: 'photos_table.createdAt',
    s3Key: 'photos_table.s3Key',
    contentType: 'photos_table.contentType',
    previewKey: 'photos_table.previewKey',
  },
}));

const albumsTable = {
  id: 'albums_table.id',
  userId: 'albums_table.userId',
  name: 'albums_table.name',
};

const albumPhotosTable = {
  albumId: 'album_photos_table.albumId',
  photoId: 'album_photos_table.photoId',
  addedAt: 'album_photos_table.addedAt',
};

jest.mock('drizzle-orm', () => ({
  eq: mockEq,
  and: mockAnd,
  or: mockOr,
  lt: mockLt,
  sql: mockSql,
  inArray: mockInArray,
  desc: mockDesc,
  isNotNull: mockIsNotNull,
  isNull: mockIsNull,
}));

jest.mock('../../shared/cloudfront', () => ({
  getPrivateKey: jest.fn().mockResolvedValue('fake-private-key'),
  cfSignedUrl: jest.fn().mockResolvedValue('https://xxx.cloudfront.net/signed-url'),
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
  process.env.USE_CLOUDFRONT = 'true';
  mockInsert.mockClear();
  mockInsertValues.mockClear();
  mockReturning.mockClear().mockResolvedValue([{ id: 'a1', name: 'My Album', userId: 'u1' }]);
  mockOnConflictDoNothing.mockClear().mockResolvedValue([]);
  mockDelete.mockClear();
  mockDeleteWhere.mockClear().mockResolvedValue([]);
  mockUpdate.mockClear();
  mockUpdateSet.mockClear();
  mockUpdateSetWhere.mockClear().mockResolvedValue([]);
  mockSelect.mockClear();
  mockFrom.mockClear();
  mockSelectWhere.mockClear().mockResolvedValue([]);
  mockInnerJoin.mockClear();
  mockLimit.mockClear().mockResolvedValue([]);
  mockOrderBy.mockClear().mockImplementation(function() {
    const result = Promise.resolve([]) as any;
    result.limit = mockLimit;
    return result;
  });
  mockWhereForCover.mockClear().mockImplementation(function() {
    const result = Promise.resolve([]) as any;
    result.orderBy = mockOrderBy;
    return result;
  });
  mockEq.mockClear();
  mockAnd.mockClear();
  mockOr.mockClear();
  mockLt.mockClear();
  mockSql.mockClear();
  mockInArray.mockClear();
  mockDesc.mockClear();
  mockIsNotNull.mockClear();
  mockIsNull.mockClear();
});

describe('manage-albums handler', () => {
  describe('POST /albums', () => {
    it('creates an album and returns 201', async () => {
      const result = await callHandler(
        makeEvent('POST', 'POST /albums', 'u1', undefined, { name: 'Vacation' }),
      );

      expect(result.statusCode).toBe(201);
      expect(mockInsert).toHaveBeenCalledWith(albumsTable);
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
    it('returns albums with null coverUrl when no cover photos exist', async () => {
      const userAlbums = [{ id: 'a1', name: 'Test', userId: 'u1' }];
      // First .where() for fetching user albums
      mockSelectWhere.mockResolvedValueOnce(userAlbums);
      // Second .where() (after innerJoin) returns { orderBy }
      // orderBy resolves to no cover rows
      mockOrderBy.mockResolvedValueOnce([]);

      const result = await callHandler(makeEvent('GET', 'GET /albums', 'u1'));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body[0].coverUrls).toEqual([]);
    });

    it('attaches coverUrl when cover photo exists', async () => {
      const userAlbums = [{ id: 'a1', name: 'Test', userId: 'u1' }];
      mockSelectWhere.mockResolvedValueOnce(userAlbums);
      mockOrderBy.mockResolvedValueOnce([
        { albumId: 'a1', thumbnailKey: 'users/u1/thumbnails/pic.jpg' },
      ]);

      const result = await callHandler(makeEvent('GET', 'GET /albums', 'u1'));

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body[0].coverUrls).toEqual(['https://xxx.cloudfront.net/signed-url']);
    });

    it('filters cover photos by album owner', async () => {
      const userAlbums = [{ id: 'a1', name: 'Test', userId: 'u1' }];
      mockSelectWhere.mockResolvedValueOnce(userAlbums);
      mockOrderBy.mockResolvedValueOnce([]);

      await callHandler(makeEvent('GET', 'GET /albums', 'u1'));

      expect(mockEq).toHaveBeenCalledWith('photos_table.userId', 'u1');
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
      // First .where() in GET /albums/{albumId} to fetch album
      mockSelectWhere.mockResolvedValueOnce([album]);
      // .orderBy().limit() chain provides the paginated photos
      mockLimit.mockResolvedValueOnce([{ photo: { id: 'p1', filename: 'pic.jpg', contentType: 'image/jpeg', thumbnailKey: null } }]);

      const result = await callHandler(
        makeEvent('GET', 'GET /albums/{albumId}', 'u1', { albumId: 'a1' }),
      );

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.id).toBe('a1');
    });

    it('filters album contents by the caller', async () => {
      const album = { id: 'a1', name: 'Test', userId: 'u1' };
      mockSelectWhere.mockResolvedValueOnce([album]);
      mockLimit.mockResolvedValueOnce([]);

      await callHandler(
        makeEvent('GET', 'GET /albums/{albumId}', 'u1', { albumId: 'a1' }),
      );

      expect(mockEq).toHaveBeenCalledWith('photos_table.userId', 'u1');
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
      mockSelectWhere.mockResolvedValueOnce([{ id: 'p1', userId: 'u1' }]);

      const result = await callHandler(
        makeEvent('POST', 'POST /albums/{albumId}/photos', 'u1', { albumId: 'a1' }, { photoId: 'p1' }),
      );

      expect(result.statusCode).toBe(201);
      expect(mockInsert).toHaveBeenCalledWith(albumPhotosTable);
    });

    it('returns 404 when photo does not belong to the caller', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 'a1', userId: 'u1' }]);
      mockSelectWhere.mockResolvedValueOnce([]);

      const result = await callHandler(
        makeEvent('POST', 'POST /albums/{albumId}/photos', 'u1', { albumId: 'a1' }, { photoId: 'p2' }),
      );

      expect(result.statusCode).toBe(404);
      expect(mockInsert).not.toHaveBeenCalledWith(albumPhotosTable);
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
      expect(mockDelete).toHaveBeenCalledWith(albumPhotosTable);
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

  describe('DELETE /albums/{albumId}', () => {
    it('deletes album and removes photo associations', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 'a1', userId: 'u1' }]);

      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /albums/{albumId}', 'u1', { albumId: 'a1' }),
      );

      expect(result.statusCode).toBe(200);
      expect(mockDelete).toHaveBeenCalledTimes(2);
      expect(mockDelete).toHaveBeenCalledWith(albumPhotosTable);
      expect(mockDelete).toHaveBeenCalledWith(albumsTable);
    });

    it('returns 404 when album not found', async () => {
      mockSelectWhere.mockResolvedValueOnce([]);

      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /albums/{albumId}', 'u1', { albumId: 'a1' }),
      );

      expect(result.statusCode).toBe(404);
    });

    it('returns 400 when albumId is missing', async () => {
      const result = await callHandler(
        makeEvent('DELETE', 'DELETE /albums/{albumId}', 'u1', {}),
      );

      expect(result.statusCode).toBe(400);
    });
  });

  describe('PUT /albums/{albumId}', () => {
    it('updates album name and returns 200', async () => {
      const existingAlbum = { id: 'a1', name: 'Old Name', userId: 'u1' };
      const updatedAlbum = { id: 'a1', name: 'New Name', userId: 'u1' };

      // First .where() for verifying album ownership
      mockSelectWhere.mockResolvedValueOnce([existingAlbum]);
      // Second .where() after update (for fetching updated album)
      mockSelectWhere.mockResolvedValueOnce([updatedAlbum]);

      const result = await callHandler(
        makeEvent('PUT', 'PUT /albums/{albumId}', 'u1', { albumId: 'a1' }, { name: 'New Name' }),
      );

      expect(result.statusCode).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith(albumsTable);
      const body = JSON.parse(result.body as string);
      expect(body.name).toBe('New Name');
    });

    it('returns 404 when album not found', async () => {
      mockSelectWhere.mockResolvedValueOnce([]);

      const result = await callHandler(
        makeEvent('PUT', 'PUT /albums/{albumId}', 'u1', { albumId: 'a1' }, { name: 'New Name' }),
      );

      expect(result.statusCode).toBe(404);
    });

    it('returns 400 when name is missing', async () => {
      const result = await callHandler(
        makeEvent('PUT', 'PUT /albums/{albumId}', 'u1', { albumId: 'a1' }, {}),
      );

      expect(result.statusCode).toBe(400);
    });

    it('returns 400 when albumId is missing', async () => {
      const result = await callHandler(
        makeEvent('PUT', 'PUT /albums/{albumId}', 'u1', {}, { name: 'New Name' }),
      );

      expect(result.statusCode).toBe(400);
    });
  });

  describe('unsupported route', () => {
    it('returns 405', async () => {
      const result = await callHandler(makeEvent('PUT', 'PUT /albums', 'u1'));
      expect(result.statusCode).toBe(405);
    });
  });
});
