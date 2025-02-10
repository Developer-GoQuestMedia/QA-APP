import { NextRequest, NextResponse } from 'next/server';
import type { AxiosResponse } from 'axios';
import axios from 'axios';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('file') as File | null;
    
    if (!audioFile || !(audioFile instanceof File)) {
      console.error('No audio file in request');
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    // Log original audio details
    console.log('Processing audio file:', {
      type: audioFile.type,
      size: audioFile.size,
      name: audioFile.name
    });
    
    // Send to noise reduction API
    const response = await axios.post(
      'https://audio-noise-reduction-676840814994.us-central1.run.app/audio-noise-reduction',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        responseType: 'arraybuffer', // Receiving binary audio data
        timeout: 30000
      }
    );

    // Verify we got audio data back
    if (!response.data || response.headers['content-type'] !== 'audio/wav') {
      console.error('Invalid response from noise reduction API:', {
        contentType: response.headers['content-type'],
        dataSize: response.data?.length
      });
      throw new Error('Invalid response from noise reduction API');
    }

    // Compare sizes to ensure we got processed audio
    const processedSize = response.data.length;
    const originalSize = audioFile.size;
    console.log('Audio processing results:', {
      originalSize,
      processedSize,
      difference: ((processedSize - originalSize) / originalSize * 100).toFixed(2) + '%'
    });

    // Create a new Blob from the processed audio
    const processedAudioBlob = new Blob([response.data], { type: 'audio/wav' });

    // Return both the processed audio and metadata
    return new NextResponse(processedAudioBlob, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': processedAudioBlob.size.toString(),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
    });
  } catch (error: any) {
    console.error('Noise reduction error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to process audio', 
        details: error.message,
        status: error.response?.status 
      },
      { 
        status: error.response?.status || 500,
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}

// Handle OPTIONS request for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
} 