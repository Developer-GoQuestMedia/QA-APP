// import { NextResponse } from 'next/server'
// import { getServerSession } from 'next-auth'
// import { authOptions } from '@/lib/auth'
// import { prisma } from '@/lib/prisma'

// export async function GET(request: Request) {
//   try {
//     const session = await getServerSession(authOptions)
//     if (!session) {
//       return new NextResponse(
//         JSON.stringify({ error: 'Unauthorized' }),
//         { status: 401 }
//       )
//     }

//     const { searchParams } = new URL(request.url)
//     const projectId = searchParams.get('projectId')

//     if (!projectId) {
//       return new NextResponse(
//         JSON.stringify({ error: 'Project ID is required' }),
//         { status: 400 }
//       )
//     }

//     const episodes = await prisma.episode.findMany({
//       where: {
//         projectId: projectId,
//       },
//       orderBy: {
//         uploadedAt: 'desc',
//       },
//     })

//     return new NextResponse(
//       JSON.stringify({ data: episodes }),
//       { status: 200 }
//     )
//   } catch (error) {
//     console.error('Episodes fetch error:', error)
//     return new NextResponse(
//       JSON.stringify({ error: 'Internal Server Error' }),
//       { status: 500 }
//     )
//   }
// }

// export const dynamic = 'force-dynamic'; 

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    // 1. Verify user session (if you require authentication)
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Extract projectId from query string
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

    // 3. Query the "Episode" model for all episodes where `projectId` matches
    //    NOTE: Check that "projectId" in your "Episode" model is either
    //    a string or int. If it's int, parseInt(projectId), etc.
    const episodes = await prisma.episode.findMany({
      where: { projectId },
      orderBy: { uploadedAt: 'desc' },
    })

    // 4. Return the episodes as JSON
    return NextResponse.json({ data: episodes }, { status: 200 })
  } catch (error) {
    console.error('Episodes fetch error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}

// Forces dynamic rendering (so we can read runtime data / session)
export const dynamic = 'force-dynamic'
