import { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand, PutObjectTaggingCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3Mock = mockClient(S3Client);

const mockWhere = jest.fn().mockResolvedValue([]);
const mockSet = jest.fn(() => ({ where: mockWhere }));
const mockUpdate = jest.fn(() => ({ set: mockSet }));

const mockOnConflictDoUpdate = jest.fn().mockResolvedValue([]);
const mockValues = jest.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
const mockInsert = jest.fn(() => ({ values: mockValues }));

const mockDb = { insert: mockInsert, update: mockUpdate };

jest.mock('../../shared/db', () => ({
  createDb: jest.fn(() => mockDb),
}));

jest.mock('../../shared/schema', () => ({
  photos: 'photos_table',
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col: unknown, val: unknown) => ({ col, val })),
}));

jest.mock('../../shared/phash', () => ({
  computePHash: jest.fn().mockResolvedValue('abcdef1234567890'),
}));

const mockExifReader = jest.fn();
jest.mock('exif-reader', () => mockExifReader);

const mockSharpMetadata = jest.fn().mockResolvedValue({
  width: 1920,
  height: 1080,
  format: 'jpeg',
  exif: undefined,
});

const mockRotate = jest.fn();
const mockResize = jest.fn();
const mockToColorspace = jest.fn();
const mockJpeg = jest.fn();
const mockGif = jest.fn();
const mockWebp = jest.fn();
const mockWithMetadata = jest.fn();
const mockToBuffer = jest.fn().mockResolvedValue(Buffer.from('thumbnail-data'));

jest.mock('sharp', () => {
  return jest.fn((buffer) => {
    if (buffer === undefined) {
      // Called with no args for metadata only
      return { metadata: mockSharpMetadata };
    }
    // Called with buffer for thumbnail generation
    mockRotate.mockReturnThis();
    mockResize.mockReturnThis();
    mockToColorspace.mockReturnThis();
    mockJpeg.mockReturnThis();
    mockGif.mockReturnThis();
    mockWebp.mockReturnThis();
    mockWithMetadata.mockReturnThis();
    return {
      metadata: mockSharpMetadata,
      rotate: mockRotate,
      resize: mockResize,
      toColorspace: mockToColorspace,
      jpeg: mockJpeg,
      gif: mockGif,
      webp: mockWebp,
      withMetadata: mockWithMetadata,
      toBuffer: mockToBuffer,
    };
  });
});


function makeSqsEvent(key: string, size = 12345): SQSEvent {
  const s3Event = {
    Records: [
      {
        s3: {
          bucket: { name: 'test-bucket' },
          object: { key, size },
        },
      },
    ],
  };
  return {
    Records: [
      {
        messageId: 'msg-1',
        body: JSON.stringify(s3Event),
      } as SQSEvent['Records'][0],
    ],
  };
}

const defaultLastModified = new Date('2024-01-15T12:00:00.000Z');

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
  mockOnConflictDoUpdate.mockClear();
  mockUpdate.mockClear();
  mockSet.mockClear();
  mockWhere.mockClear();
  mockExifReader.mockClear();
  mockRotate.mockClear().mockReturnThis();
  mockResize.mockClear().mockReturnThis();
  mockToColorspace.mockClear().mockReturnThis();
  mockJpeg.mockClear().mockReturnThis();
  mockGif.mockClear().mockReturnThis();
  mockWebp.mockClear().mockReturnThis();
  mockWithMetadata.mockClear().mockReturnThis();
  mockToBuffer.mockClear().mockResolvedValue(Buffer.from('thumbnail-data'));
  mockSharpMetadata.mockResolvedValue({
    width: 1920,
    height: 1080,
    format: 'jpeg',
    exif: undefined,
  });
  s3Mock.on(HeadObjectCommand).resolves({ ContentType: 'image/jpeg', LastModified: defaultLastModified });
  s3Mock.on(PutObjectCommand).resolves({});
  s3Mock.on(PutObjectTaggingCommand).resolves({});
});

describe('process-photo-metadata handler', () => {
  it('skips folder marker objects (keys ending with /)', async () => {
    const { handler } = await import('../src/handler');
    const result = await handler(makeSqsEvent('users/u1/photos/')) as SQSBatchResponse;

    expect(mockInsert).not.toHaveBeenCalled();
    expect(result.batchItemFailures).toHaveLength(0);
  });

  it('skips thumbnail objects in thumbnails/ subfolder', async () => {
    const { handler } = await import('../src/handler');
    const result = await handler(makeSqsEvent('users/u1/thumbnails/photo.jpg')) as SQSBatchResponse;

    expect(mockInsert).not.toHaveBeenCalled();
    expect(result.batchItemFailures).toHaveLength(0);
  });

  it('skips keys that do not start with users/', async () => {
    const { handler } = await import('../src/handler');
    const result = await handler(makeSqsEvent('other/key/photo.jpg')) as SQSBatchResponse;

    expect(mockInsert).not.toHaveBeenCalled();
    expect(result.batchItemFailures).toHaveLength(0);
  });

  it('downloads the object from S3 and extracts metadata', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
      ContentType: 'image/jpeg',
    });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/photos/photo.jpg'));

    const calls = s3Mock.commandCalls(GetObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'users/u1/photos/photo.jpg',
    });
  });

  it('upserts processing status then updates to completed with metadata', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
      ContentType: 'image/jpeg',
    });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/photos/photo.jpg', 12345));

    // Phase 1: insert with processing status
    expect(mockInsert).toHaveBeenCalledWith('photos_table');
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        s3Key: 'users/u1/photos/photo.jpg',
        filename: 'photo.jpg',
        size: 12345,
        status: 'processing',
      }),
    );
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ set: { status: 'processing', deletedAt: null } }),
    );

    // Phase 3: update to completed with thumbnail (includes takenAt and thumbnailKey)
    expect(mockUpdate).toHaveBeenCalledWith('photos_table');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        width: 1920,
        height: 1080,
        format: 'jpeg',
        contentType: 'image/jpeg',
        takenAt: defaultLastModified,
        thumbnailKey: 'users/u1/thumbnails/photo.jpg',
      }),
    );

    // Verify thumbnail was uploaded and original was tagged
    const putCommands = s3Mock.commandCalls(PutObjectCommand);
    expect(putCommands.length).toBeGreaterThan(0);
    expect(s3Mock.commandCalls(PutObjectTaggingCommand)).toHaveLength(1);
  });

  it('returns batchItemFailures when S3 download fails', async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error('S3 error'));

    const { handler } = await import('../src/handler');
    const result = await handler(makeSqsEvent('users/u1/photos/photo.jpg')) as SQSBatchResponse;

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-1' }]);
  });

  it('extracts takenAt from EXIF DateTimeOriginal', async () => {
    const takenDate = new Date('2023-06-15T10:30:00.000Z');
    const fakeExif = Buffer.from('fake-exif');
    mockSharpMetadata.mockResolvedValue({
      width: 4000,
      height: 3000,
      format: 'jpeg',
      exif: fakeExif,
    });
    mockExifReader.mockReturnValue({
      exif: { DateTimeOriginal: takenDate },
    });

    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
      ContentType: 'image/jpeg',
    });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/photos/photo.jpg'));

    expect(mockExifReader).toHaveBeenCalledWith(fakeExif);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ takenAt: takenDate }),
    );
  });

  it('falls back to Image.DateTime when DateTimeOriginal is absent', async () => {
    const takenDate = new Date('2022-01-01T00:00:00.000Z');
    const fakeExif = Buffer.from('fake-exif');
    mockSharpMetadata.mockResolvedValue({
      width: 800,
      height: 600,
      format: 'jpeg',
      exif: fakeExif,
    });
    mockExifReader.mockReturnValue({
      exif: {},
      image: { DateTime: takenDate },
    });

    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
      ContentType: 'image/jpeg',
    });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/photos/photo.jpg'));

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ takenAt: takenDate }),
    );
  });

  it('falls back to S3 LastModified for images without EXIF (e.g. PNG)', async () => {
    mockSharpMetadata.mockResolvedValue({
      width: 100,
      height: 100,
      format: 'png',
      exif: undefined,
    });

    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
    });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/photos/photo.png'));

    expect(mockExifReader).not.toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ takenAt: defaultLastModified }),
    );
  });

  it('falls back to filename date when EXIF is corrupt', async () => {
    const fakeExif = Buffer.from('corrupt-exif');
    mockSharpMetadata.mockResolvedValue({
      width: 1920,
      height: 1080,
      format: 'jpeg',
      exif: fakeExif,
    });
    mockExifReader.mockImplementation(() => { throw new Error('Invalid EXIF'); });

    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
      ContentType: 'image/jpeg',
    });

    const { handler } = await import('../src/handler');
    const result = await handler(makeSqsEvent('users/u1/photos/IMG_20231215_103045.jpg')) as SQSBatchResponse;

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ takenAt: new Date('2023-12-15T10:30:45') }),
    );
  });

  it('extracts takenAt from iOS/macOS share filename (YYYY-MM-DD HH.MM.SS)', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
      ContentType: 'image/jpeg',
    });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/photos/2026-03-02 17.08.14.jpg'));

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ takenAt: new Date('2026-03-02T17:08:14') }),
    );
  });

  it('extracts takenAt from Android filename (IMG_YYYYMMDD_HHMMSS)', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
      ContentType: 'image/jpeg',
    });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/photos/IMG_20230615_143022.jpg'));

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ takenAt: new Date('2023-06-15T14:30:22') }),
    );
  });

  it('extracts takenAt from Screenshot filename (Screenshot_YYYYMMDD-HHMMSS)', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
      ContentType: 'image/jpeg',
    });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/photos/Screenshot_20230615-143022.jpg'));

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ takenAt: new Date('2023-06-15T14:30:22') }),
    );
  });

  it('extracts date from WhatsApp filename (IMG-YYYYMMDD-WA0001)', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
      ContentType: 'image/jpeg',
    });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/photos/IMG-20231215-WA0001.jpg'));

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ takenAt: new Date('2023-12-15') }),
    );
  });

  it('falls back to S3 LastModified when filename has no recognisable date (e.g. iOS IMG_1234)', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
    });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/photos/IMG_1234.jpg'));

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ takenAt: defaultLastModified }),
    );
  });

  it('uses S3 LastModified as fallback when both EXIF and filename date are absent', async () => {
    const customLastModified = new Date('2023-09-20T08:00:00.000Z');
    s3Mock.on(HeadObjectCommand).resolves({ ContentType: 'image/jpeg', LastModified: customLastModified });
    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
    });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/photos/photo.jpg'));

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ takenAt: customLastModified }),
    );
  });

  it('uses S3 LastModified for video files (no image processing)', async () => {
    s3Mock.on(HeadObjectCommand).resolves({ ContentType: 'video/mp4', LastModified: defaultLastModified });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/videos/video.mp4'));

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: 'video/mp4',
        takenAt: defaultLastModified,
      }),
    );
  });

  it('stores animated GIF thumbnail with .gif extension and image/gif ContentType', async () => {
    mockSharpMetadata.mockResolvedValue({ width: 400, height: 300, format: 'gif', pages: 10, exif: undefined });
    s3Mock.on(HeadObjectCommand).resolves({ ContentType: 'image/gif', LastModified: defaultLastModified });
    s3Mock.on(GetObjectCommand).resolves({ Body: makeS3Body() as never });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/photos/animation.gif'));

    const putCalls = s3Mock.commandCalls(PutObjectCommand);
    expect(putCalls[0].args[0].input).toMatchObject({
      Key: 'users/u1/thumbnails/animation.gif',
      ContentType: 'image/gif',
    });
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      thumbnailKey: 'users/u1/thumbnails/animation.gif',
    }));
  });

  it('stores animated WebP thumbnail with .webp extension and image/webp ContentType', async () => {
    mockSharpMetadata.mockResolvedValue({ width: 600, height: 400, format: 'webp', pages: 5, exif: undefined });
    s3Mock.on(HeadObjectCommand).resolves({ ContentType: 'image/webp', LastModified: defaultLastModified });
    s3Mock.on(GetObjectCommand).resolves({ Body: makeS3Body() as never });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/photos/sticker.webp'));

    const putCalls = s3Mock.commandCalls(PutObjectCommand);
    expect(putCalls[0].args[0].input).toMatchObject({
      Key: 'users/u1/thumbnails/sticker.webp',
      ContentType: 'image/webp',
    });
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      thumbnailKey: 'users/u1/thumbnails/sticker.webp',
    }));
  });

  it('stores static WebP thumbnail with .webp extension and image/webp ContentType', async () => {
    mockSharpMetadata.mockResolvedValue({ width: 800, height: 600, format: 'webp', pages: 1, exif: undefined });
    s3Mock.on(HeadObjectCommand).resolves({ ContentType: 'image/webp', LastModified: defaultLastModified });
    s3Mock.on(GetObjectCommand).resolves({ Body: makeS3Body() as never });

    const { handler } = await import('../src/handler');
    await handler(makeSqsEvent('users/u1/photos/photo.webp'));

    const putCalls = s3Mock.commandCalls(PutObjectCommand);
    expect(putCalls[0].args[0].input).toMatchObject({
      Key: 'users/u1/thumbnails/photo.webp',
      ContentType: 'image/webp',
    });
  });

  it('prefers EXIF DateTimeOriginal over filename date', async () => {
    const exifDate = new Date('2020-01-01T00:00:00.000Z');
    const fakeExif = Buffer.from('real-exif');
    mockSharpMetadata.mockResolvedValue({
      width: 1920,
      height: 1080,
      format: 'jpeg',
      exif: fakeExif,
    });
    mockExifReader.mockReturnValue({ exif: { DateTimeOriginal: exifDate } });

    s3Mock.on(GetObjectCommand).resolves({
      Body: makeS3Body() as never,
      ContentType: 'image/jpeg',
    });

    const { handler } = await import('../src/handler');
    // filename has a different date — EXIF should win
    await handler(makeSqsEvent('users/u1/photos/IMG_20231215_103045.jpg'));

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ takenAt: exifDate }),
    );
  });
});
