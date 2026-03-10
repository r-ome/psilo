import { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { handler } from '../src/handler';

const s3Mock = mockClient(S3Client);
const mockGetSignedUrl = jest.mocked(getSignedUrl);

const makeEvent = (body: object, sub = 'user-123'): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    body: JSON.stringify(body),
    requestContext: { authorizer: { jwt: { claims: { sub } } } },
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

beforeEach(() => {
  s3Mock.reset();
  mockGetSignedUrl.mockReset();
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

  describe('happy path', () => {
    it('returns 200 with url and key', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned');

      const result = await handler(makeEvent({ filename: 'file.txt', contentType: 'image/png' }));

      expect(result).toMatchObject({ statusCode: 200 });
      const body = JSON.parse((result as { body: string }).body);
      expect(body.url).toBe('https://s3.example.com/presigned');
      expect(body.key).toBe('users/user-123/photos/file.txt');
    });

    it('routes photos to photos/ subdirectory', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned');

      const result = await handler(
        makeEvent({ filename: 'photo.jpg', contentType: 'image/jpeg' }, 'sub123'),
      );

      const body = JSON.parse((result as { body: string }).body);
      expect(body.key).toBe('users/sub123/photos/photo.jpg');
    });

    it('routes videos to videos/ subdirectory', async () => {
      mockGetSignedUrl.mockResolvedValue('https://s3.example.com/presigned');

      const result = await handler(
        makeEvent({ filename: 'video.mp4', contentType: 'video/mp4' }, 'sub123'),
      );

      const body = JSON.parse((result as { body: string }).body);
      expect(body.key).toBe('users/sub123/videos/video.mp4');
    });

    it('calls getSignedUrl with correct params for photo', async () => {
      mockGetSignedUrl.mockResolvedValue('https://example.com/url');

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

  describe('error path', () => {
    it('propagates error when getSignedUrl throws', async () => {
      mockGetSignedUrl.mockRejectedValue(new Error('S3 error'));

      await expect(
        handler(makeEvent({ filename: 'file.txt', contentType: 'image/png' })),
      ).rejects.toThrow('S3 error');
    });
  });
});
