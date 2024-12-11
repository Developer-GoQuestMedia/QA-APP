import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { connectToDatabase } from '@/lib/mongodb'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export async function GET() {
  console.log('GET /api/users/me - Started')
  try {
    const session = await getServerSession(authOptions)
    console.log('Session data:', session)

    if (!session?.user) {
      console.error('No session or user found')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Connecting to database...')
    const { db } = await connectToDatabase()
    const user = await db.collection('users').findOne(
      { username: session.user.username },
      { projection: { password: 0 } }
    )

    if (!user) {
      console.error('User not found in database:', session.user.username)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userData = {
      id: user._id.toString(),
      username: user.username,
      role: user.role,
      email: user.email || null,
      name: user.username
    }

    console.log('User data retrieved:', userData)
    return NextResponse.json(userData)
  } catch (error) {
    console.error('Failed to fetch user:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
} 