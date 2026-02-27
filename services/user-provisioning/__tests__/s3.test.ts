import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createUserPrefix } from '../src/s3';

const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
});

describe('createUserPrefix', () => {
  it('calls s3.send with a PutObjectCommand', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await createUserPrefix('userId', 'John', 'Doe');

    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBeInstanceOf(PutObjectCommand);
  });

  it('uses key format users/{givenName}-{familyName}-{userId}/', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await createUserPrefix('userId', 'John', 'Doe');

    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls[0].args[0].input.Key).toBe('users/John-Doe-userId/');
  });

  it('uses BUCKET_NAME env var as Bucket', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await createUserPrefix('userId', 'John', 'Doe');

    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls[0].args[0].input.Bucket).toBe('test-bucket');
  });

  it('sends an empty Body', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    await createUserPrefix('userId', 'John', 'Doe');

    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls[0].args[0].input.Body).toBe('');
  });

  it('propagates error when s3.send rejects', async () => {
    s3Mock.on(PutObjectCommand).rejects(new Error('S3 error'));

    await expect(createUserPrefix('userId', 'John', 'Doe')).rejects.toThrow('S3 error');
  });
});
