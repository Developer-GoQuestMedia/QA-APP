import { MongoClient } from 'mongodb'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
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

async function fixSessionsLog() {
  console.log('Starting sessions log fix...')
  const client = new MongoClient(MONGODB_URI as string)

  try {
    await client.connect()
    console.log('Connected to MongoDB')
    
    const db = client.db(MONGODB_DB)
    const users = await db.collection('users').find({}).toArray()
    
    for (const user of users) {
      // If sessionsLog doesn't exist or is not an array, initialize it
      if (!user.sessionsLog || !Array.isArray(user.sessionsLog)) {
        console.log(`Fixing sessionsLog for user: ${user.username}`)
        await db.collection('users').updateOne(
          { _id: user._id },
          { 
            $set: { 
              sessionsLog: [],
              lastLogin: null,
              lastLogout: null,
              lastActivityAt: new Date()
            }
          }
        )
      }
    }

    console.log('Sessions log fix completed successfully')
  } catch (error) {
    console.error('Error fixing sessions log:', error)
    throw error
  } finally {
    await client.close()
    console.log('Database connection closed')
  }
}

// Run the fix
fixSessionsLog()
  .then(() => {
    console.log('Fix completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fix failed:', error)
    process.exit(1)
  }) 