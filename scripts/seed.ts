import { MongoClient, ObjectId } from 'mongodb'
import { config } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

config()

async function seed() {
  console.log('Starting database seeding...')
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/qa-app'
  const client = new MongoClient(uri)

  try {
    await client.connect()
    console.log('Connected to MongoDB')
    
    const db = client.db()

    // Update dialogues without valid projectId
    console.log('Updating dialogues without valid projectId...')
    const result = await db.collection('dialogues').updateMany(
      { 
        $or: [
          { projectId: null },
          { projectId: "null" },
          { projectId: { $exists: false } }
        ]
      },
      {
        $set: {
          projectId: new ObjectId("123456789123456789123456")
        }
      }
    )

    console.log(`Updated ${result.modifiedCount} dialogues with default projectId`)

  } catch (error) {
    console.error('Error during seeding:', error)
  } finally {
    await client.close()
    console.log('Database connection closed')
  }
}

seed().catch(console.error) 