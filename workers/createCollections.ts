import { MongoClient } from 'mongodb';

export async function createCollections() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB);

    // Define your collections and their validation schemas here
    const collections = [
      {
        name: 'users',
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['username', 'email', 'role'],
            properties: {
              username: { bsonType: 'string' },
              email: { bsonType: 'string' },
              role: { bsonType: 'string' }
            }
          }
        }
      },
      // Add other collections as needed
    ];

    const results = await Promise.all(collections.map(async (collection) => {
      try {
        await db.createCollection(collection.name, {
          validator: collection.validator
        });
        return `Collection ${collection.name} created successfully`;
      } catch (error) {
        if ((error as any).code === 48) { // Collection already exists
          return `Collection ${collection.name} already exists`;
        }
        throw error;
      }
    }));

    return results;
  } finally {
    await client.close();
  }
} 