'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Dialogue as BaseDialogue } from '@/types/dialogue'
import { useCacheCleaner } from '@/hooks/useCacheCleaner'

// Extend the base dialogue type with additional fields needed for the director view
interface SrDirectorDialogue extends BaseDialogue {
  index: number;
  character: string;
  videoUrl: string;
  revisionRequested?: boolean;
  needsReRecord?: boolean;
  voiceId?: string;
}

// Add interface for grouped dialogues
interface CharacterGroupedDialogues {
  [character: string]: SrDirectorDialogue[];
}

// Add interface for voice model
interface VoiceModel {
  id: string;
  name: string;
  category: string;
  fineTuning: {
    isAllowed: boolean;
    language: string;
  };
  labels: {
    accent: string | null;
    description: string | null;
    age: string | null;
    gender: string | null;
    useCase: string | null;
  };
  description: string;
  previewUrl: string;
  supportedModels: string[];
  verification: {
    required: boolean;
    verified: boolean;
  };
}

interface DialogueViewProps {
  dialogues: BaseDialogue[]
  projectId: string
  project?: {
    databaseName: string;
    title: string;
  }
  episode?: {
    collectionName: string;
    name: string;
  }
}

type QueryData = {
  data: BaseDialogue[];
  status: string;
  timestamp: number;
};

// Adapter function to convert BaseDialogue to DirectorDialogue
const adaptDialogue = (dialogue: BaseDialogue): SrDirectorDialogue => ({
  ...dialogue,
  index: dialogue.subtitleIndex,
  character: dialogue.characterName,
  videoUrl: dialogue.videoClipUrl,
  revisionRequested: dialogue.status === 'revision-requested',
  needsReRecord: dialogue.status === 'needs-rerecord'
});

export default function SrDirectorDialogueView({ dialogues: initialDialogues, projectId, project, episode }: DialogueViewProps) {
  // Initialize cache cleaner
  useCacheCleaner();

  // Add state for voice models
  const [voiceModels, setVoiceModels] = useState<VoiceModel[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);

  // Add effect to fetch voice models
  useEffect(() => {
    const fetchVoiceModels = async () => {
      setIsLoadingVoices(true);
      try {
        const response = await fetch('/api/voice-models/available');
        const data = await response.json();
        if (data.success) {
          setVoiceModels(data.models);
        }
      } catch (error) {
        console.error('Error fetching voice models:', error);
      } finally {
        setIsLoadingVoices(false);
      }
    };

    fetchVoiceModels();
  }, []);

  // Memoize the adapted and sorted dialogues, and add character grouping
  const { sortedDialogues, dialoguesList, characterGroupedDialogues } = useMemo(() => {
    const adaptedDialogues = initialDialogues.map(adaptDialogue);
    const sorted = [...adaptedDialogues].sort((a, b) => 
      (a.subtitleIndex ?? 0) - (b.subtitleIndex ?? 0)
    );

    // Group dialogues by character
    const groupedByCharacter = sorted.reduce<CharacterGroupedDialogues>((acc, dialogue) => {
      const character = dialogue.characterName || 'Unknown';
      if (!acc[character]) {
        acc[character] = [];
      }
      acc[character].push(dialogue);
      return acc;
    }, {});

    console.log('SrDirectorDialogueView - Initial state:', {
      totalDialogues: sorted.length,
      firstDialogue: sorted[0],
      lastDialogue: sorted[sorted.length - 1],
      uniqueCharacters: Object.keys(groupedByCharacter).length,
      characterBreakdown: Object.entries(groupedByCharacter).map(([char, dialogues]) => ({
        character: char,
        dialogueCount: dialogues.length
      }))
    });

    return {
      sortedDialogues: sorted,
      dialoguesList: sorted,
      characterGroupedDialogues: groupedByCharacter
    };
  }, [initialDialogues]);

  // State declarations
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [currentDialogue, setCurrentDialogue] = useState<SrDirectorDialogue | null>(() => sortedDialogues[0] || null);
  const [dialogues, setDialogues] = useState<SrDirectorDialogue[]>(dialoguesList);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [error, setError] = useState<string>('');
  const [revisionRequested, setRevisionRequested] = useState(false);
  const [needsReRecord, setNeedsReRecord] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queryClient = useQueryClient();
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [isSyncedPlaying, setIsSyncedPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [dialogueFilter, setDialogueFilter] = useState<string>('all');

  // Get dialogues for selected character or all dialogues if no character selected
  const activeDialogues = useMemo(() => {
    if (!selectedCharacter) return dialoguesList;
    return characterGroupedDialogues[selectedCharacter] || [];
  }, [selectedCharacter, dialoguesList, characterGroupedDialogues]);

  // Filter dialogues based on selected filter
  const filteredDialogues = useMemo(() => {
    if (dialogueFilter === 'all') return activeDialogues;
    return activeDialogues.filter(dialogue => {
      switch (dialogueFilter) {
        case 'pending':
          return !dialogue.revisionRequested && !dialogue.needsReRecord;
        case 'revision':
          return dialogue.revisionRequested;
        case 'rerecord':
          return dialogue.needsReRecord;
        default:
          return true;
      }
    });
  }, [activeDialogues, dialogueFilter]);

  // Simplify navigation handlers
  const handleNext = useCallback(() => {
    if (currentDialogueIndex < filteredDialogues.length - 1) {
      setCurrentDialogueIndex(prev => prev + 1);
      setCurrentDialogue(filteredDialogues[currentDialogueIndex + 1]);
    }
  }, [currentDialogueIndex, filteredDialogues]);

  const handlePrevious = useCallback(() => {
    if (currentDialogueIndex > 0) {
      setCurrentDialogueIndex(prev => prev - 1);
      setCurrentDialogue(filteredDialogues[currentDialogueIndex - 1]);
    }
  }, [currentDialogueIndex, filteredDialogues]);

  // Update current dialogue when index changes - with proper dependency array
  useEffect(() => {
    const dialogue = dialoguesList[currentDialogueIndex];
    if (dialogue && dialogue !== currentDialogue) {
      console.log('Updating dialogue:', {
        dialogueNumber: dialogue.dialogNumber,
        character: dialogue.character,
        timeStart: dialogue.timeStart,
        timeEnd: dialogue.timeEnd
      });
      
      setCurrentDialogue(dialogue);
      setRevisionRequested(dialogue.revisionRequested || false);
      setNeedsReRecord(dialogue.needsReRecord || false);
    }
  }, [currentDialogueIndex, dialoguesList]);

  // Modify handleApproveAndSave to remove confirmation logic
  const handleApproveAndSave = useCallback(async () => {
    if (!currentDialogue) {
      setError('No dialogue selected');
      return;
    }

    const dialogueId = currentDialogue.dialogNumber;
    if (!dialogueId) {
      console.error('Missing dialogue ID:', currentDialogue);
      setError('Invalid dialogue ID - Missing _id field');
      return;
    }

    if (!project?.databaseName || !episode?.collectionName) {
      setError('Missing required project or episode information');
      return;
    }
    
    try {
      setIsSaving(true);
      
      const dialogueComponents = dialogueId.split('.');
      const sceneNumber = dialogueComponents[2];
      
      const updateData = {
        _id: dialogueId,
        dialogue: currentDialogue.dialogue,
        character: currentDialogue.character,
        status: revisionRequested ? 'revision-requested' : needsReRecord ? 'needs-rerecord' : 'approved',
        timeStart: currentDialogue.timeStart,
        timeEnd: currentDialogue.timeEnd,
        index: currentDialogue.index,
        voiceOverUrl: currentDialogue.voiceOverUrl,
        voiceOverNotes: currentDialogue.voiceOverNotes,
        revisionRequested,
        needsReRecord,
        databaseName: project.databaseName,
        collectionName: episode.collectionName,
        subtitleIndex: currentDialogue.subtitleIndex,
        characterName: currentDialogue.characterName,
        dialogNumber: currentDialogue.dialogNumber,
        projectId,
        sceneNumber
      };
      
      const { data: responseData } = await axios.patch(
        `/api/dialogues/update/${dialogueId}`,
        updateData,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          params: {
            databaseName: project.databaseName,
            collectionName: episode.collectionName,
            projectId
          }
        }
      );

      setDialogues(prevDialogues => 
        prevDialogues.map(d => 
          d.dialogNumber === currentDialogue.dialogNumber ? responseData : d
        )
      );

      queryClient.setQueryData(['dialogues', projectId], (oldData: QueryData | undefined) => {
        if (!oldData?.data) return oldData;
        return {
          ...oldData,
          data: oldData.data.map((d: BaseDialogue) => 
            d.dialogNumber === currentDialogue.dialogNumber ? responseData : d
          )
        };
      });

      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 2000);

      // Automatically move to next dialogue after saving
      if (currentDialogueIndex < filteredDialogues.length - 1) {
        handleNext();
      }
    } catch (error) {
      console.error('Error saving review:', error);
      setError(error instanceof Error ? error.message : 'Failed to save review');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsSaving(false);
    }
  }, [currentDialogue, project, episode, projectId, revisionRequested, needsReRecord, currentDialogueIndex, filteredDialogues.length, handleNext]);

  // Update audio duration when dialogue changes
  useEffect(() => {
    const updateAudioDuration = async () => {
      if (!currentDialogue?.voiceOverUrl) {
        setAudioDuration(0);
        return;
      }

      try {
        const audio = new Audio(currentDialogue.voiceOverUrl);
        await new Promise((resolve) => {
          audio.addEventListener('loadedmetadata', () => {
            setAudioDuration(audio.duration);
            resolve(true);
          });
          audio.addEventListener('error', () => {
            setAudioDuration(0);
            resolve(false);
          });
        });
      } catch (error) {
        console.error('Error getting audio duration:', error);
        setAudioDuration(0);
      }
    };

    updateAudioDuration();
  }, [currentDialogue?.voiceOverUrl]);

  // Update video duration when video loads
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const handleLoadedMetadata = () => {
        setVideoDuration(video.duration);
      };
      
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }
  }, [currentDialogue?.videoUrl]);

  // Clean up audio on unmount or dialogue change
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [currentDialogue?._id]);

  // Handle synced playback
  const handleSyncedPlayback = async () => {
    if (!currentDialogue?.voiceOverUrl || !videoRef.current) return;

    if (isSyncedPlaying) {
      // Stop both video and audio
      if (videoRef.current) {
        videoRef.current.pause();
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsSyncedPlaying(false);
      setIsPlaying(false);
      return;
    }

    try {
      // Create audio element
      const audio = new Audio(currentDialogue.voiceOverUrl);
      audioRef.current = audio;

      // Set up cleanup on audio end
      audio.addEventListener('ended', () => {
        setIsSyncedPlaying(false);
        setIsPlaying(false);
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.muted = false;
        }
      });

      // Mute video audio
      videoRef.current.muted = true;

      // Start playback
      videoRef.current.currentTime = 0;
      await Promise.all([
        videoRef.current.play(),
        audio.play()
      ]);

      setIsSyncedPlaying(true);
      setIsPlaying(true);
    } catch (error) {
      console.error('Failed to start synced playback:', error);
      setIsSyncedPlaying(false);
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.muted = false;
      }
    }
  };

  if (!currentDialogue) {
    return <div className="text-center p-4">No dialogues available.</div>
  }

  return (
    <div className="w-full mx-auto px-4 space-y-4 sm:space-y-6">
      {/* Project Overview Banner */}
      <div className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 p-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              All Dialogues Overview
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Total Dialogues: {dialoguesList.length}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm dark:bg-blue-900 dark:text-blue-200">
              Pending: {dialoguesList.filter(d => !d.revisionRequested && !d.needsReRecord).length}
            </span>
            <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm dark:bg-yellow-900 dark:text-yellow-200">
              Needs Revision: {dialoguesList.filter(d => d.revisionRequested).length}
            </span>
            <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm dark:bg-red-900 dark:text-red-200">
              Needs Re-record: {dialoguesList.filter(d => d.needsReRecord).length}
            </span>
          </div>
        </div>
      </div>

      {/* Enhanced Character Selection */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Character List Panel */}
        <div className="md:col-span-1 bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 p-4 flex flex-col">
          <div className="flex justify-between items-center mb-3 sticky top-0 bg-white dark:bg-gray-800 z-10">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Characters</h3>
            {selectedCharacter && (
              <button
                onClick={() => {
                  setSelectedCharacter(null);
                  setCurrentDialogueIndex(0);
                }}
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Clear Selection
              </button>
            )}
          </div>
          <div className="flex flex-col gap-4">
            {/* Character List */}
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(50vh-8rem)] scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
              {Object.entries(characterGroupedDialogues).map(([character, dialogues]) => (
                <button
                  key={character}
                  onClick={() => {
                    setSelectedCharacter(character);
                    setCurrentDialogueIndex(0);
                    const firstDialogue = dialogues[0];
                    if (firstDialogue) {
                      setCurrentDialogue(firstDialogue);
                    }
                  }}
                  className={`w-full px-4 py-2 rounded-lg text-left ${
                    selectedCharacter === character
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="font-medium">{character}</div>
                  <div className="text-sm opacity-80">{dialogues.length} dialogues</div>
                </button>
              ))}
            </div>

            {/* Voice Models Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Available Voice Models</h4>
                <div className="flex items-center gap-2">
                  <select
                    className="text-sm rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-2 py-1"
                    onChange={(e) => {
                      const filtered = voiceModels.filter(model => 
                        e.target.value === 'all' || model.category === e.target.value
                      );
                      setVoiceModels(filtered);
                    }}
                  >
                    <option value="all">All Categories</option>
                    <option value="cloned">Cloned</option>
                    <option value="generated">Generated</option>
                    <option value="professional">Professional</option>
                  </select>
                </div>
              </div>

              {isLoadingVoices ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="text-sm text-gray-500 mt-2">Loading voice models...</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4 overflow-y-auto max-h-[calc(50vh-8rem)] scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                  {voiceModels.map((model) => (
                    <div
                      key={model.id}
                      className="p-4 bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h5 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                            {model.name}
                            {model.verification.verified && (
                              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded-full dark:bg-green-900 dark:text-green-200">
                                Verified
                              </span>
                            )}
                          </h5>
                          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                            ID: {model.id}
                          </p>
                        </div>
                        <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full dark:bg-blue-900 dark:text-blue-200 whitespace-nowrap">
                          {model.category}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {/* Voice Characteristics */}
                        <div className="flex flex-wrap gap-1.5">
                          {model.labels.gender && (
                            <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded dark:bg-purple-900 dark:text-purple-200">
                              {model.labels.gender}
                            </span>
                          )}
                          {model.labels.accent && (
                            <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded dark:bg-yellow-900 dark:text-yellow-200">
                              {model.labels.accent}
                            </span>
                          )}
                          {model.labels.age && (
                            <span className="text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded dark:bg-orange-900 dark:text-orange-200">
                              {model.labels.age}
                            </span>
                          )}
                          {model.labels.useCase && (
                            <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-800 rounded dark:bg-indigo-900 dark:text-indigo-200">
                              {model.labels.useCase}
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        {model.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                            {model.description}
                          </p>
                        )}

                        {/* Fine-tuning Info */}
                        <div className="flex items-center gap-2 text-sm">
                          <span className={`w-2 h-2 rounded-full ${
                            model.fineTuning.isAllowed ? 'bg-green-500' : 'bg-red-500'
                          }`} />
                          <span className="text-gray-600 dark:text-gray-300">
                            {model.fineTuning.isAllowed ? 'Fine-tuning available' : 'No fine-tuning'}
                          </span>
                          {model.fineTuning.language && (
                            <span className="text-gray-500 dark:text-gray-400">
                              ({model.fineTuning.language})
                            </span>
                          )}
                        </div>

                        {/* Preview Audio */}
                        {model.previewUrl && (
                          <div className="mt-3">
                            <div className="flex items-center gap-2 mb-1">
                              <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.828-2.828" />
                              </svg>
                              <span className="text-sm text-gray-600 dark:text-gray-300">Preview</span>
                            </div>
                            <audio 
                              src={model.previewUrl} 
                              controls 
                              className="w-full h-8 audio-player"
                            />
                          </div>
                        )}

                        {/* Supported Models */}
                        {model.supportedModels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {model.supportedModels.map((modelId, index) => (
                              <span 
                                key={index}
                                className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded dark:bg-gray-800 dark:text-gray-300"
                                title="Supported Model ID"
                              >
                                {modelId}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-2 mt-3">
                          <button
                            onClick={() => {
                              if (currentDialogue) {
                                // Handle voice selection logic here
                                console.log(`Selected voice ${model.id} for dialogue ${currentDialogue.dialogNumber}`);
                              }
                            }}
                            disabled={!currentDialogue}
                            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Select Voice
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="md:col-span-3 space-y-4">
          {selectedCharacter ? (
            <>
              {/* Character Info Banner with Filter */}
              <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-blue-900 dark:text-blue-100">
                      {selectedCharacter}
                    </h2>
                    <p className="text-blue-700 dark:text-blue-300">
                      Viewing dialogue {currentDialogueIndex + 1} of {filteredDialogues.length}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    {/* Filter Dropdown */}
                    <select
                      value={dialogueFilter}
                      onChange={(e) => {
                        setDialogueFilter(e.target.value);
                        setCurrentDialogueIndex(0);
                      }}
                      className="px-3 py-1.5 rounded border border-blue-300 bg-white text-blue-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-blue-800 dark:border-blue-700 dark:text-blue-100"
                    >
                      <option value="all">All Dialogues</option>
                      <option value="pending">Pending Review</option>
                      <option value="revision">Needs Revision</option>
                      <option value="rerecord">Needs Re-record</option>
                    </select>
                    {/* Navigation Controls */}
                    <div className="flex gap-2">
                      <button
                        onClick={handlePrevious}
                        disabled={currentDialogueIndex === 0}
                        className="p-2 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 disabled:opacity-50"
                      >
                        ←
                      </button>
                      <button
                        onClick={handleNext}
                        disabled={currentDialogueIndex === (filteredDialogues.length - 1)}
                        className="p-2 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 disabled:opacity-50"
                      >
                        →
                      </button>
                    </div>
                  </div>
                </div>

                {/* Filter Stats */}
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  <span className="text-blue-700 dark:text-blue-300">
                    Total: {activeDialogues.length}
                  </span>
                  <span className="text-blue-700 dark:text-blue-300">
                    Pending: {activeDialogues.filter(d => !d.revisionRequested && !d.needsReRecord).length}
                  </span>
                  <span className="text-yellow-600 dark:text-yellow-400">
                    Needs Revision: {activeDialogues.filter(d => d.revisionRequested).length}
                  </span>
                  <span className="text-red-600 dark:text-red-400">
                    Needs Re-record: {activeDialogues.filter(d => d.needsReRecord).length}
                  </span>
                </div>

                {/* Dialogue Numbers Section */}
                <div className="mt-4 border-t border-blue-200 dark:border-blue-700 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      All Dialogue Numbers
                    </h3>
                    <span className="text-xs text-blue-600 dark:text-blue-300">
                      {activeDialogues.length} dialogues
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {activeDialogues.map((dialogue, index) => (
                      <button
                        key={dialogue.dialogNumber}
                        onClick={() => {
                          setCurrentDialogueIndex(index);
                          setCurrentDialogue(dialogue);
                        }}
                        className={`px-2 py-1 text-xs rounded-md truncate hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors ${
                          currentDialogue?.dialogNumber === dialogue.dialogNumber
                            ? 'bg-blue-200 dark:bg-blue-700 font-medium'
                            : 'bg-white dark:bg-gray-700'
                        }`}
                        title={`Scene: ${dialogue.dialogNumber.split('.')[2]}, Index: ${dialogue.subtitleIndex}`}
                      >
                        {dialogue.dialogNumber}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Video Player Card */}
              <div className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700 overflow-hidden">
                <div className="relative">
                  <video
                    ref={videoRef}
                    src={currentDialogue?.videoUrl}
                    className="w-full"
                  />
                  {isVideoLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                      <div className="flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
                        <span className="text-sm text-white">Loading video...</span>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Video Controls */}
                <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
                          }
                        }}
                        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                      >
                        -5s
                      </button>
                      <button
                        onClick={() => {
                          if (videoRef.current) {
                            if (isPlaying) {
                              videoRef.current.pause();
                            } else {
                              videoRef.current.play();
                            }
                            setIsPlaying(!isPlaying);
                          }
                        }}
                        className="px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                      >
                        {isPlaying ? 'Pause' : 'Play'}
                      </button>
                    </div>
                    {currentDialogue?.voiceOverUrl && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSyncedPlayback}
                          className="px-4 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm"
                        >
                          {isSyncedPlaying ? 'Stop Synced' : 'Play with Audio'}
                        </button>
                        <div 
                          className={`w-3 h-3 rounded-full ${
                            Math.abs(audioDuration - videoDuration) < 0.1 
                              ? 'bg-green-500' 
                              : 'bg-red-500'
                          }`}
                          title={Math.abs(audioDuration - videoDuration) < 0.1 
                            ? 'Audio and video durations match' 
                            : `Duration mismatch - Video: ${videoDuration.toFixed(3)}s, Audio: ${audioDuration.toFixed(3)}s`}
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Speed:</span>
                      {[0.5, 0.75, 1, 1.25, 1.5].map((rate) => (
                        <button
                          key={rate}
                          onClick={() => {
                            if (videoRef.current) {
                              videoRef.current.playbackRate = rate;
                              setPlaybackRate(rate);
                            }
                          }}
                          className={`px-2 py-1 rounded text-sm ${
                            playbackRate === rate
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Dialogue Information Card */}
              <div className="bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-800 dark:border-gray-700">
                <div className="p-5 space-y-4">
                  {/* Time Display */}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">Start:</span>
                      <p className="px-2 py-1 rounded-md border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-w-[100px] text-center">
                        {currentDialogue?.timeStart || '00:00.000'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">End:</span>
                      <p className="px-2 py-1 rounded-md border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-w-[100px] text-center">
                        {currentDialogue?.timeEnd || '00:00.000'}
                      </p>
                    </div>
                    {/* Voice ID Display */}
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="font-medium text-gray-900 dark:text-white">Voice ID:</span>
                      <p className="px-2 py-1 rounded-md border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white min-w-[100px] text-center">
                        {currentDialogue?.voiceId || 'Not assigned'}
                      </p>
                    </div>
                  </div>

                  {/* All Text Versions */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
                        Original Text
                      </label>
                      <div className="w-full p-2.5 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        {currentDialogue?.dialogue.original}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
                        Translated Text
                      </label>
                      <div className="w-full p-2.5 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        {currentDialogue?.dialogue.translated}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
                        Adapted Text
                      </label>
                      <div className="w-full p-2.5 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        {currentDialogue?.dialogue.adapted}
                      </div>
                    </div>
                  </div>

                  {/* Voice-over Player */}
                  {currentDialogue.voiceOverUrl && (
                    <div className="flex items-center justify-center">
                      <audio controls src={currentDialogue.voiceOverUrl} className="w-64" />
                    </div>
                  )}

                  {/* Voice-over Notes Display */}
                  {currentDialogue.voiceOverNotes && (
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">
                        Voice-over Notes
                      </label>
                      <div className="w-full p-2.5 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        {currentDialogue.voiceOverNotes}
                      </div>
                    </div>
                  )}

                  {/* Revision Request and Re-record Toggles */}
                  <div className="flex items-center space-x-6">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="revisionRequested"
                        checked={revisionRequested}
                        onChange={(e) => setRevisionRequested(e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <label htmlFor="revisionRequested" className="text-sm font-medium text-gray-900 dark:text-white">
                        Request Revision
                      </label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="needsReRecord"
                        checked={needsReRecord}
                        onChange={(e) => setNeedsReRecord(e.target.checked)}
                        className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 dark:focus:ring-purple-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <label htmlFor="needsReRecord" className="text-sm font-medium text-gray-900 dark:text-white">
                        Needs Re-record
                      </label>
                    </div>
                  </div>

                  {/* Navigation and Info */}
                  <div className="flex items-center justify-center pt-4 mt-4 border-t border-gray-200 dark:border-gray-600">
                    <div className="text-center">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        Dialogue {currentDialogueIndex + 1} of {dialoguesList.length}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {currentDialogue?.timeStart} - {currentDialogue?.timeEnd}
                      </div>
                    </div>
                  </div>

                  {/* Add Save Button */}
                  <div className="flex justify-end pt-4">
                    <button
                      onClick={handleApproveAndSave}
                      disabled={isSaving}
                      className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? 'Saving...' : revisionRequested ? 'Request Revision' : 'Approve'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center dark:bg-gray-800 dark:border-gray-600">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Select a Character
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Choose a character from the list to view and manage their dialogues
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Feedback Messages */}
      {isSaving && (
        <div className="fixed top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded shadow-lg z-50">
          Saving review...
        </div>
      )}
      
      {showSaveSuccess && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50">
          Review saved successfully!
        </div>
      )}
      
      {error && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50">
          {error}
        </div>
      )}
    </div>
  )
} 