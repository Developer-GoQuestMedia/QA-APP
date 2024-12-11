import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import bcrypt from 'bcryptjs'
import { sign } from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()

    const { db } = await connectToDatabase()
    const user = await db.collection('users').findOne({ email })

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Update last login
    await db.collection('users').updateOne(
      { _id: user._id },
      { 
        $set: { lastLogin: new Date() },
        $push: { 
          sessionsLog: {
            loginTime: new Date(),
            userAgent: req.headers.get('user-agent') || 'unknown'
          }
        }
      }
    )

    // Create token
    const token = sign(
      {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        username: user.username
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    )

    return NextResponse.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        username: user.username
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 