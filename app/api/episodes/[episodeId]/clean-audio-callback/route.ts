import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getSocketInstance } from '@/lib/socket';
// If you need authentication, import getServerSession and authOptions:
// import { getServerSession } from 'next-auth';
// import { authOptions } from '@/lib/auth';

interface Episode {
  _id: { $oid: string };
  name: string;
  collectionName: string;
  videoPath: string;
  videoKey: string;
  status: string;
  uploadedAt: { $date: string };
  step1?: {
    inputParameters: {
      name: string;
      videoPath: string;
      videoKey: string;
      episodeId: string;
    };
    cleanedSpeechPath: string;
    cleanedSpeechKey: string;
    musicAndSoundEffectsPath: string;
    musicAndSoundEffectsKey: string;
    updatedAt: { $date: string };
  };
}

function checkEpisodeNames(episodes: Episode[]) {
  episodes.forEach((episode) => {
    if (episode.step1 && episode.step1.inputParameters) {
      const { name } = episode.step1.inputParameters;
      console.log(`Episode ID: ${episode._id.$oid}, Name: ${name}`);
    } else {
      console.log(`Episode ID: ${episode._id.$oid} has no step1 inputParameters.`);
    }
  });
}

export async function POST(
  request: Request,
  { params }: { params: { episodeId: string } }
) {
  // Optional: If you want to validate a user session, uncomment the lines below:
  /*
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  */

  if (!params.episodeId) {
    return NextResponse.json(
      { error: 'episodeId is required in the URL.' },
      { status: 400 }
    );
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    inputParameters,
    cleanedSpeechPath,
    cleanedSpeechKey,
    musicAndSoundEffectsPath,
    musicAndSoundEffectsKey,
  } = body;

  // Ensure inputParameters is an object
  if (typeof inputParameters !== 'object') {
    return NextResponse.json({ error: 'Invalid inputParameters format' }, { status: 400 });
  }

  // Destructure inputParameters
  const { name } = inputParameters;

  // Validate required fields
  if (
    !inputParameters ||
    !cleanedSpeechPath ||
    !cleanedSpeechKey ||
    !musicAndSoundEffectsPath ||
    !musicAndSoundEffectsKey
  ) {
    return NextResponse.json(
      {
        error:
          'Missing one of the required fields: inputParameters, cleanedSpeechPath, cleanedSpeechKey, musicAndSoundEffectsPath, musicAndSoundEffectsKey',
      },
      { status: 400 }
    );
  }

  try {
    const { db } = await connectToDatabase();

    // Confirm the episode exists
    const episodeObjectId = new ObjectId(params.episodeId);
    const findEpisode = await db.collection('projects').findOne(
      { 'episodes._id': episodeObjectId },
      { projection: { 'episodes.$': 1 } }
    );

    if (!findEpisode || !findEpisode.episodes?.[0]) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    // Update that episode's step1 object
    await db.collection('projects').updateOne(
      { 'episodes._id': episodeObjectId },
      {
        $set: {
          'episodes.$.step1': {
            inputParameters,
            cleanedSpeechPath,
            cleanedSpeechKey,
            musicAndSoundEffectsPath,
            musicAndSoundEffectsKey,
            updatedAt: new Date(),
          },
        },
      }
    );

    // Notify admin view with the name from inputParameters and log the data
    notifyAdmin(`Processing complete for: ${name}`);

    return NextResponse.json({
      success: true,
      notifyMessage: `Processing complete for: ${name}`
    });
  } catch (error: any) {
    console.error('Error updating episode:', error);
    return NextResponse.json(
      { error: 'Failed to update the episode data.' },
      { status: 500 }
    );
  }
}

// Function to notify admin view
function notifyAdmin(message: string) {
  try {
    const io = getSocketInstance();
    if (io && typeof io.emit === 'function') {
      io.emit('notification', { message, type: 'success' });
      console.log('Admin Notification sent:', message);
    } else {
      console.log('Admin Notification queued (socket not ready):', message);
    }
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}
