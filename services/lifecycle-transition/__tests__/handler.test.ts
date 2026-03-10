import { handler } from '../src/handler';

// Mock dependencies
jest.mock('../../shared/db');

const mockDb = {
  update: jest.fn().mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue({}),
    }),
  }),
};

jest.mock('../../shared/db', () => ({
  createDb: jest.fn(() => mockDb),
}));

describe('lifecycle-transition handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update storage class to GLACIER', async () => {
    const event = {
      source: 'aws.s3',
      'detail-type': 'Object Storage Class Changed',
      detail: {
        bucket: { name: 'test-bucket' },
        object: { key: 'users/test-user/photo.jpg' },
        'destination-storage-class': 'GLACIER',
      },
    };

    await handler(event as any);

    expect(mockDb.update).toHaveBeenCalled();
  });

  it('should update storage class to STANDARD', async () => {
    const event = {
      source: 'aws.s3',
      'detail-type': 'Object Storage Class Changed',
      detail: {
        bucket: { name: 'test-bucket' },
        object: { key: 'users/test-user/photo.jpg' },
        'destination-storage-class': 'STANDARD',
      },
    };

    await handler(event as any);

    expect(mockDb.update).toHaveBeenCalled();
  });

  it('should skip unrecognized storage classes', async () => {
    const event = {
      source: 'aws.s3',
      'detail-type': 'Object Storage Class Changed',
      detail: {
        bucket: { name: 'test-bucket' },
        object: { key: 'users/test-user/photo.jpg' },
        'destination-storage-class': 'DEEP_ARCHIVE',
      },
    };

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    await handler(event as any);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unrecognized storage class'),
    );
    expect(mockDb.update).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should decode URL-encoded keys', async () => {
    const event = {
      source: 'aws.s3',
      'detail-type': 'Object Storage Class Changed',
      detail: {
        bucket: { name: 'test-bucket' },
        object: { key: 'users/test-user/photo%20with%20spaces.jpg' },
        'destination-storage-class': 'GLACIER',
      },
    };

    await handler(event as any);

    expect(mockDb.update).toHaveBeenCalled();
  });
});
