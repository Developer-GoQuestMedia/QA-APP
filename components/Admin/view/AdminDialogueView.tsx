'use client'

import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Loader2 as Loader } from 'lucide-react'
import axios from 'axios'
import { Dialogue, DialogueText } from '@/types/dialogue'
import { Project, Episode } from '@/types/project'
import { useCacheCleaner } from '@/hooks/useCacheCleaner'
import { Plus, Search, UserPlus, ChevronRight } from 'lucide-react'

// Extend the base dialogue type with additional fields needed for the admin view
interface AdminDialogue extends Dialogue {
  index: number;
  character: string;
  videoUrl: string;
  revisionRequested: boolean;
  needsReRecord: boolean;
}

interface AdminDialogueViewProps {
  project: Project;
  episode: Episode;
  dialogues: Dialogue[];
  onSave: (dialogues: Dialogue[]) => Promise<void>;
  projectId: string;
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
  needsReRecord: dialogue.status === 'needs-rerecord'
});

export default function AdminDialogueView({
  dialogues,
  onSave,
}: AdminDialogueViewProps) {
  // Initialize cache cleaner
  useCacheCleaner();

  // Memoize the adapted and sorted dialogues
  const { sortedDialogues, dialoguesList } = React.useMemo(() => {
    const adaptedDialogues = dialogues.map(adaptDialogue);
    const sorted = [...adaptedDialogues].sort((a, b) => 
      (a.subtitleIndex ?? 0) - (b.subtitleIndex ?? 0)
    );

    return {
      sortedDialogues: sorted,
      dialoguesList: sorted
    };
  }, [dialogues]);

  // State declarations
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 space-y-4 sm:space-y-6">
      {/* Back Button */}
      {/* {onBack && (
        <button
          onClick={onBack}
          className="mb-4 px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white flex items-center"
        >
          <ChevronRight className="w-4 h-4 mr-2 transform rotate-180" />
          Back to Episodes
        </button>
      )} */}

      {/* Video Player Card */}
      <div className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
        {/* ... Video player implementation ... */}
      </div>

      {/* Dialogue Information Card */}
      <motion.div className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700">
        {/* ... Dialogue information implementation ... */}
      </motion.div>

      {/* Confirmation Modal */}
      {/* {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          {/* ... Confirmation modal implementation ... */}
        {/* </div>
      )} */}

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