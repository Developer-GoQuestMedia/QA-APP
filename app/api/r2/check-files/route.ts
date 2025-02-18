import { NextResponse } from 'next/server';
import { getR2Client } from '@/lib/r2';
import { HeadObjectCommand, ListObjectsV2Command, S3ServiceException, CommonPrefix } from '@aws-sdk/client-s3';

export async function GET(request: Request) {
  try {
    // Log all environment variables (without values)
    const envVars = {
      R2_ACCOUNT_ID: !!process.env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: !!process.env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: !!process.env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME: !!process.env.R2_BUCKET_NAME,
      R2_PUBLIC_URL: !!process.env.R2_PUBLIC_URL,
      R2_BUCKET_ENDPOINT: !!process.env.R2_BUCKET_ENDPOINT,
    };
    console.log('Environment variables check:', envVars);

    const { searchParams } = new URL(request.url);
    const databaseName = searchParams.get('databaseName')?.trim();
    const collectionName = searchParams.get('collectionName')?.trim();
    const files = searchParams.getAll('files[]');
    const path = searchParams.get('path')?.trim() || '';

    // Log incoming request parameters
    console.log('R2 Check Files Request:', {
      databaseName,
      collectionName,
      path,
      filesCount: files.length,
      files,
    });

    if (!databaseName || !collectionName) {
      const missingParams = [
        !databaseName && 'databaseName',
        !collectionName && 'collectionName',
      ].filter(Boolean);

      return NextResponse.json(
        { error: `Missing required parameters: ${missingParams.join(', ')}` },
        { status: 400 }
      );
    }

    // Get R2 client and configuration
    console.log('Initializing R2 client...');
    const r2 = await getR2Client();
    console.log('R2 client initialized successfully');

    const bucketName = process.env.R2_BUCKET_NAME;
    const baseUrl = process.env.R2_PUBLIC_URL;

    if (!bucketName || !baseUrl) {
      const missingEnv = [
        !bucketName && 'R2_BUCKET_NAME',
        !baseUrl && 'R2_PUBLIC_URL',
      ].filter(Boolean);

      throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}`);
    }

    const exists: string[] = [];
    const notFound: string[] = [];
    const errors: { file: string; error: string }[] = [];

    // Construct the prefix based on path parameter
    let prefix = path ? path : `${databaseName}/${collectionName}/`;
    if (!prefix.endsWith('/')) {
      prefix += '/';
    }

    console.log('Using prefix for file listing:', prefix);

    // If no specific files are requested, list all files in the directory
    if (!files.length) {
      try {
        console.log(`Listing all files with prefix: ${prefix} in bucket ${bucketName}`);
        
        const listCommand = new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix,
          Delimiter: '/'
        });
        
        const listResult = await r2.send(listCommand);
        
        console.log('List result:', {
          CommonPrefixes: listResult.CommonPrefixes?.map(p => p.Prefix),
          Contents: listResult.Contents?.map(c => c.Key),
          KeyCount: listResult.KeyCount,
          IsTruncated: listResult.IsTruncated
        });

        if (listResult.Contents) {
          exists.push(...listResult.Contents.map(obj => {
            const key = obj.Key || '';
            return key.replace(prefix, ''); // Remove the prefix to get just the filename
          }).filter(name => name !== '')); // Filter out empty names
        }

        // Also include common prefixes (subdirectories)
        if (listResult.CommonPrefixes) {
          exists.push(...listResult.CommonPrefixes.map((commonPrefix: CommonPrefix) => {
            const prefixStr = commonPrefix.Prefix || '';
            return prefixStr.replace(prefix, '').replace(/\/$/, ''); // Remove trailing slash
          }).filter(name => name !== '')); // Filter out empty names
        }
      } catch (error) {
        console.error('Error listing files:', error);
        errors.push({ file: '*', error: error instanceof Error ? error.message : 'Unknown error' });
      }
    } else {
      // Check specific files
      for (const file of files) {
        const key = `${prefix}${file}`;
        try {
          console.log(`Checking file existence: ${key} in bucket ${bucketName}`);
          const headCommand = new HeadObjectCommand({
            Bucket: bucketName,
            Key: key
          });
          await r2.send(headCommand);
          exists.push(file);
          console.log(`File exists: ${key}`);
        } catch (error) {
          if (error instanceof S3ServiceException) {
            if (error.$metadata?.httpStatusCode === 404) {
              console.log(`File not found: ${key}`);
              notFound.push(file);
            } else {
              console.error(`S3 error checking file ${key}:`, {
                name: error.name,
                message: error.message,
                statusCode: error.$metadata?.httpStatusCode,
                requestId: error.$metadata?.requestId
              });
              errors.push({ file, error: error.message });
            }
          } else {
            console.error(`Unexpected error checking file ${key}:`, error);
            errors.push({ file, error: error instanceof Error ? error.message : 'Unknown error' });
          }
          continue;
        }
      }
    }

    const response = {
      exists,
      notFound,
      errors: errors.length > 0 ? errors : undefined,
      baseUrl: `${baseUrl}/${prefix.replace(/\/$/, '')}`,
      prefix
    };

    console.log('R2 Check Files Response:', response);
    return NextResponse.json(response);
  } catch (error) {
    // Enhanced error logging
    if (error instanceof Error) {
      console.error('Error in R2 check-files route:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause
      });
    } else {
      console.error('Unknown error in R2 check-files route:', error);
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to check files',
        details: error instanceof Error ? error.stack : undefined,
        type: error instanceof Error ? error.name : typeof error
      },
      { status: 500 }
    );
  }
} 