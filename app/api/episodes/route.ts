import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return new NextResponse(
        JSON.stringify({ error: 'Project ID is required' }),
        { status: 400 }
      )
    }

    const episodes = await prisma.episode.findMany({
      where: {
        projectId: projectId,
      },
      orderBy: {
        uploadedAt: 'desc',
      },
    })

    return new NextResponse(
      JSON.stringify({ data: episodes }),
      { status: 200 }
    )
  } catch (error) {
    console.error('Episodes fetch error:', error)
    return new NextResponse(
      JSON.stringify({ error: 'Internal Server Error' }),
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic'; 