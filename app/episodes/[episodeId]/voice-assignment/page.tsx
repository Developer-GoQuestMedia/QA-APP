import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { redirect } from 'next/navigation';
import VoiceAssignmentView from '@/components/VoiceAssignmentView';

interface PageProps {
  params: {
    episodeId: string;
  };
}

export default async function VoiceAssignmentPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect('/auth/signin');
  }

  const { db } = await connectToDatabase();
  
  // Find the episode
  const episode = await db.collection('projects').findOne(
    { 'episodes._id': new ObjectId(params.episodeId) },
    { projection: { 'episodes.$': 1 } }
  );

  if (!episode || !episode.episodes?.[0]) {
    redirect('/episodes');
  }

  const targetEpisode = episode.episodes[0];
  const characters = targetEpisode.steps?.step5?.characters || [];

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Voice Assignment</h1>
      <VoiceAssignmentView
        episodeId={params.episodeId}
        characters={characters}
        onAssignmentComplete={() => {
          // This will be handled client-side in the component
        }}
      />
    </div>
  );
} 