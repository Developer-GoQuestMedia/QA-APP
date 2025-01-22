import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { Episode } from '@/types/project';

async function addEpisodeIds() {
  try {
    console.log('Starting episode ID migration...');
    const { db } = await connectToDatabase();

    // Get all projects
    const projects = await db.collection('projects').find({}).toArray();
    console.log(`Found ${projects.length} projects to process`);

    for (const project of projects) {
      if (!project.episodes || !project.episodes.length) {
        console.log(`Skipping project ${project._id} - no episodes`);
        continue;
      }

      console.log(`Processing ${project.episodes.length} episodes for project ${project._id}`);

      // Add _id to each episode that doesn't have one
      const updatedEpisodes = project.episodes.map((episode: Partial<Episode>) => {
        if (!episode._id) {
          return {
            ...episode,
            _id: new ObjectId()
          };
        }
        return episode;
      });

      // Update the project with the new episode data
      const result = await db.collection('projects').updateOne(
        { _id: project._id },
        { $set: { episodes: updatedEpisodes } }
      );

      console.log(`Updated project ${project._id}: ${result.modifiedCount} modifications`);
    }

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
addEpisodeIds(); 