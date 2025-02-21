'use client'

import dynamic from 'next/dynamic'

const SpeedInsights = dynamic(() => 
  process.env.NODE_ENV === 'production'
    ? import('@vercel/speed-insights/next').then(mod => mod.SpeedInsights)
    : Promise.resolve(() => null)
, { ssr: false })

export default function SpeedInsightsClient() {
  return <SpeedInsights />
} 