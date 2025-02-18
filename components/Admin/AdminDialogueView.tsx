'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useMotionValue, useAnimation, type PanInfo } from 'framer-motion'
import axios from 'axios'
import { Dialogue, DialogueText } from '@/types/dialogue'
import { Project, Episode } from '@/types/project'
import { useCacheCleaner } from '@/hooks/useCacheCleaner'
import { Plus, Search, UserPlus, ChevronRight, Loader2 } from 'lucide-react'


// Extend the base dialogue type with additional fields needed for the admin view
interface AdminDialogue extends Omit<Dialogue, 'recordedAudioUrl' | 'ai_converted_voiceover_url'> {
  index: number;
  character: string;
  videoUrl: string;
  revisionRequested?: boolean;
  needsReRecord?: boolean;
  recordedAudioUrl: string | null;
  voiceId: string | null | undefined;
  ai_converted_voiceover_url?: string;
}

interface AdminDialogueViewProps {
  dialogues: Dialogue[];
  projectId: string;
  project?: {
    databaseName: string;
    title: string;
  };
  episode?: {
    collectionName: string;
    name: string;
  };
  onBack?: () => void;
}

type QueryData = {
  data: Dialogue[];
  status: string;
  timestamp: number;
};

// Adapter function to convert Dialogue to AdminDialogue
const adaptDialogue = (dialogue: Dialogue): AdminDialogue => ({
  ...dialogue,
  index: dialogue.subtitleIndex,
  character: dialogue.characterName,
  videoUrl: dialogue.videoClipUrl,
  revisionRequested: dialogue.status === 'revision-requested',
  needsReRecord: dialogue.status === 'needs-rerecord',
  recordedAudioUrl: dialogue.recordedAudioUrl,
  voiceId: dialogue.voiceId,
  ai_converted_voiceover_url: dialogue.ai_converted_voiceover_url
});

export default function AdminDialogueView({ dialogues: initialDialogues, projectId, project, episode, onBack }: AdminDialogueViewProps) {
  // Initialize cache cleaner
  useCacheCleaner();

  // Memoize the adapted and sorted dialogues
  const { sortedDialogues, dialoguesList } = useMemo(() => {
    const adaptedDialogues = initialDialogues.map(adaptDialogue);
    const sorted = [...adaptedDialogues].sort((a, b) => 
      (a.subtitleIndex ?? 0) - (b.subtitleIndex ?? 0)
    );

    return {
      sortedDialogues: sorted,
      dialoguesList: sorted
    };
  }, [initialDialogues]);

  // State declarations
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [currentDialogue, setCurrentDialogue] = useState<AdminDialogue | null>(() => sortedDialogues[0] || null);
  const [dialogues, setDialogues] = useState<AdminDialogue[]>(dialoguesList);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [error, setError] = useState<string>('');
  const [directorNotes, setDirectorNotes] = useState('');
  const [revisionRequested, setRevisionRequested] = useState(false);
  const [needsReRecord, setNeedsReRecord] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queryClient = useQueryClient();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [isSyncedPlaying, setIsSyncedPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);

  // ... Rest of the component implementation combining DirectorDialogueView and SrDirectorDialogueView features ...
  // (The implementation would be quite long, so I'll continue in the next message)

  return (
    <div className="w-full max-w-4xl mx-auto px-4 space-y-4 sm:space-y-6">
      {/* Back Button */}
      {onBack && (
        <button
          onClick={onBack}
          className="mb-4 px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white flex items-center"
        >
          <ChevronRight className="w-4 h-4 mr-2 transform rotate-180" />
          Back to Episodes
        </button>
      )}

      {/* Video Player Card */}
      <div className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
        {/* ... Video player implementation ... */}
      </div>

      {/* Dialogue Information Card */}
      <motion.div className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700">
        {/* ... Dialogue information implementation ... */}
      </motion.div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          {/* ... Confirmation modal implementation ... */}
        </div>
      )}

      {/* Feedback Messages */}
      {isSaving && (
        <div className="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow-lg z-50">
          Saving changes...
        </div>
      )}
      
      {showSaveSuccess && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50">
          Changes saved successfully!
        </div>
      )}
      
      {error && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50">
          {error}
        </div>
      )}
    </div>
  );
} 