# QA Application Documentation

## Overview
A Next.js-based web application for managing and processing dialogues with multiple user roles including transcribers, translators, voice-over artists, directors, and administrators.

## Technical Stack

### Core Technologies
- **Framework**: Next.js 14.2
- **Language**: TypeScript
- **Database**: MongoDB
- **Authentication**: NextAuth.js
- **State Management**: TanStack React Query
- **Styling**: TailwindCSS
- **Animation**: Framer Motion
- **Testing**: Jest & React Testing Library

### Key Dependencies

#### Backend Services:
- MongoDB for database
- AWS S3 for file storage
- Vercel Blob for asset management

#### Frontend Libraries:
- React 18
- Framer Motion for animations
- TanStack React Query for data fetching
- React Swipeable for touch interactions

## Project Structure

```
├── app/
│   ├── api/                 # API routes
│   ├── allDashboards/      # Role-specific dashboard views
│   ├── components/         # App-specific components
│   ├── dashboard/         # Main dashboard
│   ├── login/            # Authentication pages
│   └── styles/          # Global styles
├── components/         # Reusable components
├── hooks/             # Custom React hooks
├── lib/              # Utility functions and configurations
├── scripts/          # Database seeding scripts
├── types/            # TypeScript type definitions
└── utils/            # Helper functions
```

## Core Components

### View Components:
- **TranscriberView**: For transcribing dialogues
- **TranslatorView**: For translating dialogues
- **VoiceOverView**: For recording voice-overs
- **DirectorView**: For reviewing and approving content
- **AdminView**: For system administration

### Dialogue Components:
- **TranscriberDialogueView**: Detailed dialogue transcription interface
- **TranslatorDialogueView**: Translation interface
- **VoiceOverDialogueView**: Voice recording interface
- **DirectorDialogueView**: Review and approval interface

## Features

### 1. User Management
- Role-based authentication
- Secure login system
- Role-specific dashboards

### 2. Dialogue Processing
- Transcription workflow
- Translation system
- Voice-over recording
- Director review process

### 3. Project Management
- Project creation and organization
- Progress tracking
- Status management

### 4. Media Handling
- Audio recording and playback
- Video playback support
- File upload and storage

## Development Tools

### Testing
- Jest for unit and integration testing
- React Testing Library for component testing
- MongoDB Memory Server for database testing

### Code Quality
- ESLint for code linting
- TypeScript for type safety
- Prettier for code formatting

### Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run tests
npm run seed         # Seed database
npm run seed:users   # Seed user data
```

## Environment Configuration
Required environment variables:
- `MONGODB_URI`: MongoDB connection string
- `NEXTAUTH_SECRET`: Authentication secret
- `NEXTAUTH_URL`: Authentication URL
- AWS S3 credentials for file storage
- Vercel Blob configuration

## Security Features
- JWT-based authentication
- Secure password hashing (bcryptjs)
- Environment variable protection
- Role-based access control

## Performance Optimizations
- Next.js image optimization
- React Query for efficient data caching
- Lazy loading of components
- Optimized build process

## Deployment
The application is configured for deployment on Vercel with:
- Automatic HTTPS
- Edge functions support
- Asset optimization
- Serverless functions

## Best Practices

### 1. Code Organization:
- Component-based architecture
- Separation of concerns
- TypeScript for type safety

### 2. Security:
- Environment variable protection
- Secure authentication
- Input validation

### 3. Performance:
- Optimized builds
- Efficient data fetching
- Proper caching strategies
