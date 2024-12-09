import 'dotenv/config';
import { connectToDatabase } from './mongodb.js'
import bcrypt from 'bcryptjs'

const seed = async () => {
  const { db } = await connectToDatabase()

  // Clear existing users
  await db.collection('users').deleteMany({})

  // Create dummy users
  const users = [
    {
      username: 'transcriber1',
      password: await bcrypt.hash('trans123', 10),
      role: 'transcriber',
      lastLogin: null,
      lastLogout: null,
      sessionsLog: [],
      assignedProjects: []
    },
    {
      username: 'translator1',
      password: await bcrypt.hash('tran123', 10),
      role: 'translator',
      lastLogin: null,
      lastLogout: null,
      sessionsLog: [],
      assignedProjects: []
    },
    {
      username: 'voiceover1',
      password: await bcrypt.hash('voice123', 10),
      role: 'voice-over',
      lastLogin: null,
      lastLogout: null,
      sessionsLog: [],
      assignedProjects: []
    },
    {
      username: 'director1',
      password: await bcrypt.hash('dir123', 10),
      role: 'director',
      lastLogin: null,
      lastLogout: null,
      sessionsLog: [],
      assignedProjects: []
    },
    {
      username: 'admin1',
      password: await bcrypt.hash('admin123', 10),
      role: 'admin',
      lastLogin: null,
      lastLogout: null,
      sessionsLog: [],
      assignedProjects: []
    }
  ]

  await db.collection('users').insertMany(users)
  console.log('Database seeded!')
}

seed().catch(console.error) 