import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

interface UploadMessage {
  file: ArrayBuffer;
  fileName: string;
  projectId: string;
  projectTitle: string;
  episodeName: string;
  contentType: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    endpoint: string;
    bucketName: string;
  };
}

interface UploadResponse {
  success: boolean;
  fileKey?: string;
  error?: string;
}

self.onmessage = async (e: MessageEvent<UploadMessage>) => {
  const { file, fileName, projectTitle, episodeName, contentType, credentials } = e.data;

  try {
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: credentials.endpoint,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });

    const fileKey = `${projectTitle}/${episodeName}/${fileName}`;
    
    const putCommand = new PutObjectCommand({
      Bucket: credentials.bucketName,
      Key: fileKey,
      Body: Buffer.from(file),
      ContentType: contentType,
    });

    await s3Client.send(putCommand);

    const response: UploadResponse = { success: true, fileKey };
    self.postMessage(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const response: UploadResponse = { success: false, error: errorMessage };
    self.postMessage(response);
  }
}; 