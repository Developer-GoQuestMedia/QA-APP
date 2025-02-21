import { S3Client } from '@aws-sdk/client-s3';

let r2Client: S3Client | null = null;

export async function getR2Client(): Promise<S3Client> {
  try {
    if (r2Client) {
      console.log('Returning existing R2 client');
      return r2Client;
    }

    console.log('Creating new R2 client...');
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketEndpoint = process.env.R2_BUCKET_ENDPOINT;

    // Log environment variable status (without exposing values)
    console.log('R2 Configuration Status:', {
      hasAccountId: !!accountId,
      hasAccessKeyId: !!accessKeyId,
      hasSecretKey: !!secretAccessKey,
      hasBucketEndpoint: !!bucketEndpoint,
      accountIdLength: accountId?.length,
      accessKeyIdLength: accessKeyId?.length,
      secretKeyLength: secretAccessKey?.length,
    });

    if (!accountId || !accessKeyId || !secretAccessKey) {
      const missingVars = [
        !accountId && 'R2_ACCOUNT_ID',
        !accessKeyId && 'R2_ACCESS_KEY_ID',
        !secretAccessKey && 'R2_SECRET_ACCESS_KEY',
      ].filter(Boolean);
      
      throw new Error(`Missing required R2 credentials: ${missingVars.join(', ')}`);
    }

    // Use the provided bucket endpoint if available, otherwise construct it
    const endpoint = bucketEndpoint || `https://${accountId}.r2.cloudflarestorage.com`;
    console.log('Initializing S3 client with endpoint:', endpoint);

    r2Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Test the connection
    try {
      await r2Client.config.credentials();
      console.log('R2 client credentials validated successfully');
    } catch (error) {
      console.error('R2 client credentials validation failed:', error);
      r2Client = null;
      throw error;
    }

    console.log('R2 client created successfully');
    return r2Client;
  } catch (error) {
    console.error('Failed to initialize R2 client:', {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error
    });
    throw error;
  }
} 