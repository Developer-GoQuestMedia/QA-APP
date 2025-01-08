import { MongoClient } from 'mongodb'
import bcrypt from 'bcryptjs'
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

async function seedUsers() {
  console.log('Starting user seeding...')
  console.log('Using database:', MONGODB_DB)
  
  const client = new MongoClient(MONGODB_URI as string)

  try {
    await client.connect()
    console.log('Connected to MongoDB Atlas')
    
    const db = client.db(MONGODB_DB)

    // Drop existing users collection if it exists
    try {
      await db.collection('users').drop()
      console.log('Dropped existing users collection')
    } catch (error) {
      console.log('No existing users collection to drop')
    }

    // Create users collection
    const users = [
      {
        username: 'transcriber1',
        email: 'transcriber1@email.com',
        password: await bcrypt.hash('trans123', 10),
        role: 'transcriber',
        lastLogin: null,
        lastLogout: null,
        sessionsLog: [],
        assignedProjects: [],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        username: 'translator1',
        email: 'translator1@email.com',
        password: await bcrypt.hash('tran123', 10),
        role: 'translator',
        lastLogin: null,
        lastLogout: null,
        sessionsLog: [],
        assignedProjects: [],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        username: 'voiceover1',
        email: 'voiceover1@email.com',
        password: await bcrypt.hash('voice123', 10),
        role: 'voiceOver',
        lastLogin: null,
        lastLogout: null,
        sessionsLog: [],
        assignedProjects: [],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        username: 'director1',
        email: 'director1@email.com',
        password: await bcrypt.hash('dir123', 10),
        role: 'director',
        lastLogin: null,
        lastLogout: null,
        sessionsLog: [],
        assignedProjects: [],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        username: 'admin1',
        email: 'admin1@email.com',
        password: await bcrypt.hash('admin123', 10),
        role: 'admin',
        lastLogin: null,
        lastLogout: null,
        sessionsLog: [],
        assignedProjects: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]

    console.log('Creating users...')
    const result = await db.collection('users').insertMany(users)
    console.log(`Successfully inserted ${result.insertedCount} users`)

    // Create indexes
    console.log('Creating indexes...')
    await db.collection('users').createIndex({ email: 1 }, { unique: true })
    await db.collection('users').createIndex({ username: 1 }, { unique: true })
    console.log('Created indexes on email and username')

  } catch (error) {
    console.error('Error seeding users:', error)
    throw error
  } finally {
    await client.close()
    console.log('Database connection closed')
  }
}

// Run the seed function
seedUsers()
  .then(() => {
    console.log('Seeding completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Seeding failed:', error)
    process.exit(1)
  }) 