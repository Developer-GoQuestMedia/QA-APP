import { MongoClient } from 'mongodb'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env.local if it exists, otherwise from .env
dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const MONGODB_URI = process.env.MONGODB_URI
const MONGODB_DB = process.env.MONGODB_DB

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable')
}

if (!MONGODB_DB) {
  throw new Error('Please define the MONGODB_DB environment variable')
}

async function migrateRoles() {
  console.log('Starting role migration...')
  console.log('Using database:', MONGODB_DB)
  
  const client = new MongoClient(MONGODB_URI as string)

  try {
    await client.connect()
    console.log('Connected to MongoDB Atlas')
    
    const db = client.db(MONGODB_DB)

    // Update project assignments
    const result = await db.collection('projects').updateMany(
      { 'assignedTo.role': 'voiceOver' },
      { $set: { 'assignedTo.$[elem].role': 'voiceOver' } },
      { arrayFilters: [{ 'elem.role': 'voiceOver' }] }
    )

    console.log(`Updated ${result.modifiedCount} project assignments`)

  } catch (error) {
    console.error('Error migrating roles:', error)
    throw error
  } finally {
    await client.close()
    console.log('Database connection closed')
  }
}

// Run the migration function
migrateRoles()
  .then(() => {
    console.log('Migration completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  }) 