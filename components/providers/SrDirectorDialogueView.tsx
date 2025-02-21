'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Dialogue as BaseDialogue } from '@/types/dialogue'
import { useCacheCleaner } from '@/hooks/useCacheCleaner'

// Types
interface DialogueText {
  original: string;
  translated: string;
  adapted: string;
}

interface LocalBaseDialogue {
  _id: string;
  dialogNumber: string;
  dialogue: DialogueText;
  characterName: string;
  status: string;
  timeStart: number;
  timeEnd: number;
  subtitleIndex: number;
  videoClipUrl?: string;
  recordedAudioUrl?: string | null;
  voiceOverNotes?: string;
  voiceId?: string | null;
  ai_converted_voiceover_url?: string;
}

interface SrDirectorDialogue extends Omit<LocalBaseDialogue, '_id'> {
  _id?: string;
  index: number;
  character: string;
  videoUrl?: string;
  revisionRequested: boolean;
  needsReRecord: boolean;
  recordedAudioUrl: string | null;
  voiceId?: string | null;
  ai_converted_voiceover_url?: string;
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

// Add debounce hook
const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

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
  status: dialogue.status || 'pending',
  timeStart: Number(dialogue.timeStart) || 0,
  timeEnd: Number(dialogue.timeEnd) || 0,
  revisionRequested: dialogue.status === 'revision-requested',
  needsReRecord: dialogue.status === 'needs-rerecord',
  recordedAudioUrl: dialogue.recordedAudioUrl || null,
  voiceId: (dialogue as any).voiceId,
  ai_converted_voiceover_url: (dialogue as any).ai_converted_voiceover_url
});

// Add R2 base URL constant at the top of the file
const R2_BASE_URL = 'https://pub-ca2dd6ef0390446c8dda16e228d97cf6.r2.dev';

// Add these helper functions at the top of the file after the R2_BASE_URL constant
const PREVIEW_STORAGE_KEY = 'voice_preview_data';

const storePreviewData = (dialogueId: string, audioUrl: string) => {
  try {
    const previewData = {
      dialogueId,
      audioUrl,
      timestamp: new Date().getTime()
    };
    localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(previewData));
  } catch (error) {
    console.error('Failed to store preview data:', error);
  }
};

const getStoredPreviewData = (dialogueId: string) => {
  try {
    const storedData = localStorage.getItem(PREVIEW_STORAGE_KEY);
    if (!storedData) return null;

    const previewData = JSON.parse(storedData);
    // Check if preview is for current dialogue and not older than 1 hour
    if (previewData.dialogueId === dialogueId && 
        (new Date().getTime() - previewData.timestamp) < 3600000) {
      return previewData.audioUrl;
    }
    return null;
  } catch (error) {
    console.error('Failed to retrieve preview data:', error);
    return null;
  }
};

const clearPreviewData = () => {
  try {
    localStorage.removeItem(PREVIEW_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear preview data:', error);
  }
};

// Add polling helper function
const pollForAudioFile = async (url: string, maxAttempts = 30, interval = 2000): Promise<boolean> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      console.log('Polling for audio file - Attempt:', {
        attempt: attempt + 1,
        url,
        maxAttempts
      });

      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        console.log('Audio file found:', { url, attempt: attempt + 1 });
        return true;
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, interval));
    } catch (error) {
      console.log('Polling attempt failed:', {
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  return false;
};

export default function SrDirectorDialogueView({ dialogues: initialDialogues, projectId, project, episode }: DialogueViewProps) {
  // Initialize cache cleaner
  useCacheCleaner();

  // Add state for voice models
  const [allVoiceModels, setAllVoiceModels] = useState<VoiceModel[]>([]);
  const [filteredVoiceModels, setFilteredVoiceModels] = useState<VoiceModel[]>([]);
  const [selectedGender, setSelectedGender] = useState('all');
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);

  // Add search state
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Add state for character search
  const [characterSearchQuery, setCharacterSearchQuery] = useState('');
  const debouncedCharacterSearchQuery = useDebounce(characterSearchQuery, 300);

  // Add debugging for component initialization
  useEffect(() => {
    console.log('SrDirectorDialogueView - Component Mount:', {
      initialDialoguesCount: initialDialogues.length,
      projectId,
      projectInfo: {
        databaseName: project?.databaseName,
        title: project?.title
      },
      episodeInfo: {
        collectionName: episode?.collectionName,
        name: episode?.name
      },
      dialogueState: {
        currentDialogueIndex: 0,
        hasCurrentDialogue: false,
        selectedCharacter: null,
        totalDialogues: 0
      }
    });
  }, []);

  // Update effect to fetch voice models with debugging
  useEffect(() => {
    const fetchVoiceModels = async () => {
      console.log('Voice Models - Fetch Start');
      setIsLoadingVoices(true);
      try {
        const { data } = await axios.get('/api/voice-models/available');
        console.log('Voice Models - Fetch Response:', {
          success: data.success,
          modelCount: data.models?.length,
          firstModel: data.models?.[0]
        });
        if (data.success) {
          setAllVoiceModels(data.models);
          setFilteredVoiceModels(data.models);
        }
      } catch (error) {
        console.error('Voice Models - Fetch Error:', error);
      } finally {
        setIsLoadingVoices(false);
      }
    };

    fetchVoiceModels();
  }, []);

  // Modify the filtering effect to include search
  useEffect(() => {
    const filtered = allVoiceModels.filter(model => {
      const matchesGender = selectedGender === 'all' || 
        model.labels.gender?.toLowerCase() === selectedGender.toLowerCase();
      
      const matchesSearch = debouncedSearchQuery === '' ||
        model.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
      
      return matchesGender && matchesSearch;
    });
    setFilteredVoiceModels(filtered);
  }, [selectedGender, allVoiceModels, debouncedSearchQuery]);

  // Memoize the adapted and sorted dialogues, and add character grouping
  const { sortedDialogues, dialoguesList, characterGroupedDialogues } = useMemo(() => {
    const renderTimestamp = new Date().toISOString();
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

    // Log initial state only once with a unique timestamp
    console.log('SrDirectorDialogueView - Initialization:', {
      timestamp: renderTimestamp,
      renderType: 'initial',
      totalDialogues: sorted.length,
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
  }, [initialDialogues]); // Only depend on initialDialogues

  // Remove the duplicate initialization effect and consolidate into a single mount effect
  useEffect(() => {
    const mountTimestamp = new Date().toISOString();
    
    // Log mount information once
    console.log('SrDirectorDialogueView - Mount:', {
      timestamp: mountTimestamp,
      componentState: {
        initialDialoguesCount: initialDialogues.length,
        projectId,
        projectInfo: {
          databaseName: project?.databaseName,
          title: project?.title
        },
        episodeInfo: {
          collectionName: episode?.collectionName,
          name: episode?.name
        }
      }
    });

    // Set up cleanup
    return () => {
      console.log('SrDirectorDialogueView - Cleanup:', {
        timestamp: new Date().toISOString(),
        componentState: {
          dialoguesCount: dialoguesList.length,
          selectedCharacter: null,
          currentDialogueIndex: 0
        }
      });
    };
  }, []); // Empty dependency array for mount/unmount only

  // State declarations
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);
  const [currentDialogue, setCurrentDialogue] = useState<SrDirectorDialogue | null>(null);
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

  // Add state for voice processing
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  // Add state for converted audio playback
  const [isPlayingConverted, setIsPlayingConverted] = useState(false);
  const convertedAudioRef = useRef<HTMLAudioElement | null>(null);

  // Add new state for converted audio playback with video
  const [isPlayingVideoWithConverted, setIsPlayingVideoWithConverted] = useState(false);
  const [isProcessingBulkVoiceUpdate, setIsProcessingBulkVoiceUpdate] = useState(false);

  // Add state for selected voice model
  const [selectedVoiceModel, setSelectedVoiceModel] = useState<VoiceModel | null>(null);

  // Add new state for tracking video state
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Add new state for preview mode
  const [previewVoiceModel, setPreviewVoiceModel] = useState<VoiceModel | null>(null);
  const [isPreviewProcessing, setIsPreviewProcessing] = useState(false);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);

  // Add video loading states
  const [videoLoadingStates, setVideoLoadingStates] = useState<{ [key: string]: boolean }>({});

  // Add preloaded videos ref to store references
  const preloadedVideosRef = useRef<{[key: string]: HTMLVideoElement}>({});

  // Modify the preload video function with proper error handling and cleanup
  const preloadVideo = useCallback((url: string) => {
    if (!url) return;

    try {
      // Check if video is already preloaded
      if (preloadedVideosRef.current[url]) {
        return;
      }

      // Create video element
      const video = document.createElement('video');
      
      // Add error handling
      video.addEventListener('error', () => {
        console.error('Video preload error:', {
          url,
          error: video.error?.message || 'Unknown error'
        });
        // Clean up failed preload
        delete preloadedVideosRef.current[url];
      });

      // Add load success handling
      video.addEventListener('loadeddata', () => {
        console.log('Video preloaded successfully:', { url });
      });

      // Set attributes
      video.preload = 'auto';
      video.src = url;
      
      // Store reference
      preloadedVideosRef.current[url] = video;

    } catch (error) {
      console.error('Video preload setup error:', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }, []);

  // Add cleanup effect for preloaded videos
  useEffect(() => {
    return () => {
      // Clean up all preloaded videos on unmount
      Object.values(preloadedVideosRef.current).forEach(video => {
        video.src = '';
        video.load();
      });
      preloadedVideosRef.current = {};
    };
  }, []);

  const handleVideoLoad = useCallback((dialogueNumber: string) => {
    setVideoLoadingStates(prev => ({
      ...prev,
      [dialogueNumber]: false
    }));
    setIsVideoReady(true);
    setVideoError(null);
  }, []);

  const handleVideoLoadStart = useCallback((dialogueNumber: string) => {
    setVideoLoadingStates(prev => ({
      ...prev,
      [dialogueNumber]: true
    }));
    setIsVideoReady(false);
  }, []);

  const handleVideoError = useCallback((error: any, dialogueNumber: string) => {
    console.error('Video loading error:', {
      dialogueNumber,
      error
    });
    setVideoLoadingStates(prev => ({
      ...prev,
      [dialogueNumber]: false
    }));
    setVideoError('Failed to load video');
    setIsVideoReady(false);
  }, []);

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

  // Add filtered characters logic
  const filteredCharacters = useMemo(() => {
    return Object.entries(characterGroupedDialogues).filter(([character]) => 
      character.toLowerCase().includes(debouncedCharacterSearchQuery.toLowerCase())
    );
  }, [characterGroupedDialogues, debouncedCharacterSearchQuery]);

  // Optimize state tracking to reduce unnecessary updates
  useEffect(() => {
    const stateUpdateTimestamp = new Date().toISOString();
    const stateSnapshot = {
      timestamp: stateUpdateTimestamp,
      type: 'state-update',
      updates: {
        character: {
          selected: selectedCharacter,
          dialoguesCount: selectedCharacter ? characterGroupedDialogues[selectedCharacter]?.length : 0
        },
        dialogue: {
          currentIndex: currentDialogueIndex,
          total: filteredDialogues.length,
          hasCurrentDialogue: !!currentDialogue,
          currentId: currentDialogue?.dialogNumber
        },
        audio: {
          hasRecordedAudio: !!currentDialogue?.recordedAudioUrl,
          hasConvertedAudio: !!currentDialogue?.ai_converted_voiceover_url,
          selectedVoiceId: currentDialogue?.voiceId
        }
      }
    };

    // Only log if there are meaningful changes
    if (
      stateSnapshot.updates.character.selected !== undefined ||
      stateSnapshot.updates.dialogue.currentId !== undefined ||
      stateSnapshot.updates.audio.hasRecordedAudio !== undefined
    ) {
      console.log('State Update:', stateSnapshot);
    }
  }, [
    selectedCharacter,
    currentDialogueIndex,
    currentDialogue,
    filteredDialogues.length,
    characterGroupedDialogues
  ]);

  // Optimize dialogue update effect
  useEffect(() => {
    if (!selectedCharacter) {
      console.log('Dialogue Update - No character selected, skipping update');
      return;
    }

    const dialogue = activeDialogues[currentDialogueIndex];
    if (!dialogue) {
      console.log('Dialogue Update - No dialogue found at index:', currentDialogueIndex);
      return;
    }

    // Only update if the dialogue number has changed
    if (!currentDialogue || dialogue.dialogNumber !== currentDialogue.dialogNumber) {
      console.log('Dialogue Update:', {
        timestamp: new Date().toISOString(),
        type: 'dialogue-change',
        details: {
          dialogueNumber: dialogue.dialogNumber,
          character: dialogue.character,
          index: currentDialogueIndex,
          audio: {
            hasRecordedAudio: !!dialogue.recordedAudioUrl,
            hasConvertedAudio: !!dialogue.ai_converted_voiceover_url,
            voiceId: dialogue.voiceId
          },
          timing: {
            start: dialogue.timeStart,
            end: dialogue.timeEnd
          }
        }
      });
      
      setCurrentDialogue(dialogue);
      setRevisionRequested(dialogue.revisionRequested || false);
      setNeedsReRecord(dialogue.needsReRecord || false);
    }
  }, [currentDialogueIndex, activeDialogues, selectedCharacter, currentDialogue]);

  // Add logging for character selection
  const handleCharacterSelection = useCallback((character: string, dialogues: SrDirectorDialogue[]) => {
    console.log('Character Selection - Start:', {
      selectedCharacter: character,
      dialoguesCount: dialogues.length,
      firstDialogue: dialogues[0],
      currentIndex: currentDialogueIndex,
      dialogueState: {
        hasCurrentDialogue: !!currentDialogue,
        currentDialogueId: currentDialogue?.dialogNumber,
        hasRecordedAudio: !!currentDialogue?.recordedAudioUrl,
        hasConvertedAudio: !!currentDialogue?.ai_converted_voiceover_url
      }
    });

    // Reset states when selecting a character
    setCurrentDialogueIndex(0);
    setSelectedCharacter(character);
    
    // Set the first dialogue for the selected character
    const firstDialogue = dialogues[0];
    if (firstDialogue) {
      console.log('Character Selection - Setting First Dialogue:', {
        dialogueNumber: firstDialogue.dialogNumber,
        character: firstDialogue.character,
        hasRecordedAudio: !!firstDialogue.recordedAudioUrl,
        hasConvertedAudio: !!firstDialogue.ai_converted_voiceover_url,
        voiceId: firstDialogue.voiceId,
        timeStart: firstDialogue.timeStart,
        timeEnd: firstDialogue.timeEnd
      });

      // Clean up previously preloaded videos
      Object.values(preloadedVideosRef.current).forEach(video => {
        video.src = '';
        video.load();
      });
      preloadedVideosRef.current = {};

      // Preload first few videos with a delay to prevent overwhelming the browser
      dialogues.slice(0, 3).forEach((dialogue, index) => {
        const videoUrl = dialogue.videoUrl;
        if (videoUrl) {
          setTimeout(() => {
            console.log('Preloading video:', {
              dialogueNumber: dialogue.dialogNumber,
              videoUrl,
              preloadIndex: index
            });
            preloadVideo(videoUrl);
          }, index * 500); // Stagger preloads by 500ms
        }
      });

      setCurrentDialogue(firstDialogue);
      setRevisionRequested(firstDialogue.revisionRequested || false);
      setNeedsReRecord(firstDialogue.needsReRecord || false);
    } else {
      console.log('Character Selection - No dialogues available for character');
      setCurrentDialogue(null);
    }
  }, [currentDialogue, currentDialogueIndex, preloadVideo]);

  // Add clear character selection handler
  const handleClearCharacterSelection = useCallback(() => {
    console.log('Clearing character selection');
    setSelectedCharacter(null);
    setCurrentDialogueIndex(0);
    setCurrentDialogue(null);
    setRevisionRequested(false);
    setNeedsReRecord(false);
  }, []);

  // Add debugging for dialogue navigation
  const handleNext = useCallback(() => {
    console.log('Navigation - Next:', {
      currentIndex: currentDialogueIndex,
      totalDialogues: filteredDialogues.length,
      canMoveNext: currentDialogueIndex < filteredDialogues.length - 1
    });

    if (currentDialogueIndex < filteredDialogues.length - 1) {
      const nextIndex = currentDialogueIndex + 1;
      const nextDialogue = filteredDialogues[nextIndex];
      
      console.log('Navigation - Next Dialogue:', {
        nextIndex,
        dialogueNumber: nextDialogue.dialogNumber,
        character: nextDialogue.character,
        hasRecordedAudio: !!nextDialogue.recordedAudioUrl,
        hasConvertedAudio: !!nextDialogue.ai_converted_voiceover_url
      });

      setCurrentDialogueIndex(nextIndex);
      setCurrentDialogue(nextDialogue);
    }
  }, [currentDialogueIndex, filteredDialogues]);

  const handlePrevious = useCallback(() => {
    console.log('Navigation - Previous:', {
      currentIndex: currentDialogueIndex,
      canMovePrevious: currentDialogueIndex > 0
    });

    if (currentDialogueIndex > 0) {
      const prevIndex = currentDialogueIndex - 1;
      const prevDialogue = filteredDialogues[prevIndex];

      console.log('Navigation - Previous Dialogue:', {
        prevIndex,
        dialogueNumber: prevDialogue.dialogNumber,
        character: prevDialogue.character,
        hasRecordedAudio: !!prevDialogue.recordedAudioUrl,
        hasConvertedAudio: !!prevDialogue.ai_converted_voiceover_url
      });

      setCurrentDialogueIndex(prevIndex);
      setCurrentDialogue(prevDialogue);
    }
  }, [currentDialogueIndex, filteredDialogues]);

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
        recordedAudioUrl: currentDialogue.recordedAudioUrl,
        voiceOverNotes: currentDialogue.voiceOverNotes,
        revisionRequested,
        needsReRecord,
        databaseName: project.databaseName,
        collectionName: episode.collectionName,
        subtitleIndex: currentDialogue.subtitleIndex,
        characterName: currentDialogue.characterName,
        dialogNumber: currentDialogue.dialogNumber,
        projectId,
        sceneNumber,
        voiceId: currentDialogue.voiceId,
        ai_converted_voiceover_url: currentDialogue.ai_converted_voiceover_url
      };
      
      console.log('Saving dialogue with voice data:', {
        dialogueId,
        voiceId: currentDialogue.voiceId,
        hasConvertedAudio: !!currentDialogue.ai_converted_voiceover_url,
        character: currentDialogue.character,
        updateContext: {
          databaseName: project.databaseName,
          collectionName: episode.collectionName,
          projectId
        }
      });
      
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
      if (!currentDialogue?.recordedAudioUrl) {
        setAudioDuration(0);
        return;
      }

      try {
        const audio = new Audio(currentDialogue.recordedAudioUrl);
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
  }, [currentDialogue?.recordedAudioUrl]);

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
    if (!currentDialogue?.recordedAudioUrl || !videoRef.current) return;

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
      const audio = new Audio(currentDialogue.recordedAudioUrl);
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

  // Add handleVideoPlayPause function
  const handleVideoPlayPause = useCallback(() => {
    if (!videoRef.current || !isVideoReady || videoError) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying, isVideoReady, videoError]);

  // Add status verification helper
  const canModifyVoice = (dialogue: SrDirectorDialogue) => {
    const modifiableStatuses = ['pending', 'approved', 'revision-requested', 'needs-rerecord'];
    return modifiableStatuses.includes(dialogue.status || 'pending');
  };

  // Update verifyVoiceAssignment to fix bulk removal verification
  const verifyVoiceAssignment = (dialogue: SrDirectorDialogue, voiceModel: VoiceModel | null): { isValid: boolean; error?: string } => {
    // Check if dialogue exists
    if (!dialogue) {
      return { isValid: false, error: 'Invalid dialogue' };
    }

    // For voice removal operations
    if (!voiceModel) {
      // Allow removal even if no voice ID is assigned - this is a safe operation
      return { isValid: true };
    }

    // Check dialogue status
    const validStatuses = ['pending', 'approved', 'revision-requested', 'needs-rerecord', 'voice-over-added'];
    if (!validStatuses.includes(dialogue.status || 'pending')) {
      return { isValid: false, error: `Invalid status for voice assignment: ${dialogue.status}` };
    }

    // For voice assignment operations
    // Verify voice model requirements
    if (voiceModel.verification.required && !voiceModel.verification.verified) {
      return { isValid: false, error: 'Voice model requires verification' };
    }

    return { isValid: true };
  };

  const verifyAudioConversion = (dialogue: SrDirectorDialogue): { isValid: boolean; error?: string } => {
    if (!dialogue) {
      return { isValid: false, error: 'Invalid dialogue' };
    }

    // Verify recorded audio exists
    if (!dialogue.recordedAudioUrl) {
      return { isValid: false, error: 'No recorded audio available for conversion' };
    }

    // Verify voice ID exists
    if (!dialogue.voiceId) {
      return { isValid: false, error: 'No voice ID assigned for conversion' };
    }

    // Verify dialogue status allows conversion
    const validStatuses = ['pending', 'approved', 'revision-requested', 'needs-rerecord', 'voice-over-added'];
    if (!validStatuses.includes(dialogue.status || 'pending')) {
      return { isValid: false, error: `Invalid status for audio conversion: ${dialogue.status}` };
    }

    // Verify character name exists (required for output path)
    if (!dialogue.characterName) {
      return { isValid: false, error: 'Missing character name' };
    }

    return { isValid: true };
  };

  // Modify handleVoiceSelection to use verification
  const handleVoiceSelection = async (model: VoiceModel) => {
    const isRemovingVoice = model.id === '';

    if (!currentDialogue) {
      setError('No dialogue selected');
      return;
    }

    // Add verification check
    const verificationResult = verifyVoiceAssignment(currentDialogue, isRemovingVoice ? null : model);
    if (!verificationResult.isValid) {
      setError(verificationResult.error || 'Voice assignment verification failed');
      setTimeout(() => setError(''), 3000);
      return;
    }

    console.log('Voice Selection - Start:', {
      operation: isRemovingVoice ? 'remove' : 'assign',
      selectedModel: model,
      currentDialogue: {
        id: currentDialogue.dialogNumber,
        status: currentDialogue.status,
        hasRecordedAudio: !!currentDialogue.recordedAudioUrl,
        hasVoiceId: !!currentDialogue.voiceId,
        hasConvertedAudio: !!currentDialogue.ai_converted_voiceover_url,
        currentVoiceId: currentDialogue.voiceId
      }
    });

    // Add verification check for voice model
    if (!isRemovingVoice && model.verification.required && !model.verification.verified) {
      setError('This voice model requires verification before use.');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setSelectedVoiceModel(isRemovingVoice ? null : model);

    if (!currentDialogue) return;

    try {
      if (isRemovingVoice) {
        const response = await fetch(
          `/api/dialogues/remove-voice/${currentDialogue.dialogNumber}?` + 
          new URLSearchParams({
            projectId,
            databaseName: project?.databaseName || '',
            collectionName: episode?.collectionName || ''
          }),
          {
            method: 'DELETE'
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to remove voice ID');
        }

        console.log('Voice Selection - Voice removed:', {
          dialogueNumber: currentDialogue.dialogNumber,
          response: data
        });

        const updatedDialogue = {
          ...currentDialogue,
          voiceId: null
        };

        setCurrentDialogue(updatedDialogue);
        setDialogues(prevDialogues => 
          prevDialogues.map(d => 
            d.dialogNumber === currentDialogue.dialogNumber ? updatedDialogue : d
          )
        );

      } else {
        // Add verification check for bulk operations
        if (model.verification.required && !model.verification.verified) {
          throw new Error('Voice model requires verification');
        }

        // Existing voice assignment logic
        const dialogueComponents = currentDialogue.dialogNumber.split('.');
        const sceneNumber = dialogueComponents[2];

        const updateData = {
          _id: currentDialogue.dialogNumber,
          dialogue: currentDialogue.dialogue,
          character: currentDialogue.character,
          characterName: currentDialogue.characterName,
          status: currentDialogue.status || 'pending',
          timeStart: currentDialogue.timeStart,
          timeEnd: currentDialogue.timeEnd,
          index: currentDialogue.index,
          recordedAudioUrl: currentDialogue.recordedAudioUrl || null,
          voiceOverNotes: currentDialogue.voiceOverNotes,
          revisionRequested: currentDialogue.revisionRequested,
          needsReRecord: currentDialogue.needsReRecord,
          databaseName: project?.databaseName,
          collectionName: episode?.collectionName,
          subtitleIndex: currentDialogue.subtitleIndex,
          dialogNumber: currentDialogue.dialogNumber,
          projectId,
          sceneNumber,
          voiceId: model.id,
          ai_converted_voiceover_url: currentDialogue.ai_converted_voiceover_url
        };

        const { data: responseData } = await axios.patch(
          `/api/dialogues/update/${currentDialogue.dialogNumber}`,
          updateData,
          {
            headers: {
              'Content-Type': 'application/json',
            },
            params: {
              databaseName: project?.databaseName,
              collectionName: episode?.collectionName,
              projectId
            }
          }
        );

        const updatedDialogue = {
          ...currentDialogue,
          voiceId: model.id
        };

        setCurrentDialogue(updatedDialogue);
        setDialogues(prevDialogues => 
          prevDialogues.map(d => 
            d.dialogNumber === currentDialogue.dialogNumber ? updatedDialogue : d
          )
        );
      }

      queryClient.setQueryData(['dialogues', projectId], (oldData: QueryData | undefined) => {
        if (!oldData?.data) return oldData;
        return {
          ...oldData,
          data: oldData.data.map((d: BaseDialogue) => 
            d.dialogNumber === currentDialogue.dialogNumber ? 
            { ...d, voiceId: isRemovingVoice ? null : model.id } : d
          )
        };
      });

      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 2000);

    } catch (error) {
      console.error('Voice Selection - Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        dialogueNumber: currentDialogue.dialogNumber,
        isRemovingVoice,
        verificationStatus: !isRemovingVoice ? {
          required: model.verification.required,
          verified: model.verification.verified
        } : null
      });
      setError(error instanceof Error ? error.message : 'Failed to update voice');
      setTimeout(() => setError(''), 3000);
    }
  };

  // Modify handleProcessVoice to use verification
  const handleProcessVoice = async () => {
    if (isProcessingVoice) {
      console.log('Process Voice - Skipped:', {
        reason: 'Conversion already in progress',
        dialogueId: currentDialogue?.dialogNumber
      });
      return;
    }

    if (!currentDialogue) {
      setError('No dialogue selected');
      return;
    }

    // Add verification check
    const verificationResult = verifyAudioConversion(currentDialogue);
    if (!verificationResult.isValid) {
      console.error('Process Voice - Verification Failed:', {
        dialogueId: currentDialogue.dialogNumber,
        error: verificationResult.error,
        status: currentDialogue.status,
        hasRecordedAudio: !!currentDialogue.recordedAudioUrl,
        characterName: currentDialogue.characterName
      });
      setError(verificationResult.error || 'Audio conversion verification failed');
      setTimeout(() => setError(''), 3000);
      return;
    }

    console.log('Process Voice - Start:', {
      currentDialogue: {
        id: currentDialogue.dialogNumber,
        hasRecordedAudio: !!currentDialogue.recordedAudioUrl,
        hasVoiceId: !!currentDialogue.voiceId,
        hasConvertedAudio: !!currentDialogue.ai_converted_voiceover_url,
        characterName: currentDialogue.characterName,
        verificationResult,
        projectInfo: {
          name: project?.databaseName,
          episode: episode?.collectionName
        }
      }
    });

    try {
      setIsProcessingVoice(true);
      
      const { data } = await axios.post('/api/voice-models/speech-to-speech', {
        voiceId: currentDialogue.voiceId || null,
        recordedAudioUrl: currentDialogue.recordedAudioUrl,
        dialogueNumber: currentDialogue.dialogNumber,
        characterName: currentDialogue.characterName,
        projectName: project?.databaseName,
        episodeName: episode?.collectionName,
        outputPath: `/${project?.databaseName}/${episode?.collectionName}/converted_audio/${currentDialogue.characterName.toLowerCase()}/${currentDialogue.dialogNumber}.wav`
      });

      if (!data.success) {
        throw new Error('Failed to process voice conversion');
      }

      // Update the dialogue with the converted audio URL
      const dialogueComponents = currentDialogue.dialogNumber.split('.');
      const sceneNumber = dialogueComponents[2];

      const updateData = {
        _id: currentDialogue.dialogNumber,
        dialogue: currentDialogue.dialogue,
        character: currentDialogue.character,
        characterName: currentDialogue.characterName,
        status: currentDialogue.status || 'pending',
        timeStart: currentDialogue.timeStart,
        timeEnd: currentDialogue.timeEnd,
        index: currentDialogue.index,
        recordedAudioUrl: currentDialogue.recordedAudioUrl,
        voiceOverNotes: currentDialogue.voiceOverNotes,
        revisionRequested: currentDialogue.revisionRequested,
        needsReRecord: currentDialogue.needsReRecord,
        databaseName: project?.databaseName,
        collectionName: episode?.collectionName,
        subtitleIndex: currentDialogue.subtitleIndex,
        dialogNumber: currentDialogue.dialogNumber,
        projectId,
        sceneNumber,
        voiceId: currentDialogue.voiceId,
        ai_converted_voiceover_url: `/${project?.databaseName}/${episode?.collectionName}/converted_audio/${currentDialogue.characterName.toLowerCase()}/${currentDialogue.dialogNumber}.wav`
      };

      const { data: responseData } = await axios.patch(
        `/api/dialogues/update/${currentDialogue.dialogNumber}`,
        updateData,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          params: {
            databaseName: project?.databaseName,
            collectionName: episode?.collectionName,
            projectId
          }
        }
      );

      // Update local state with converted audio
      const finalDialogue = {
        ...currentDialogue,
        ai_converted_voiceover_url: `/${project?.databaseName}/${episode?.collectionName}/converted_audio/${currentDialogue.characterName.toLowerCase()}/${currentDialogue.dialogNumber}.wav`
      };

      setDialogues(prevDialogues => {
        const updatedDialogues = prevDialogues.map(d => 
          d.dialogNumber === currentDialogue.dialogNumber ? finalDialogue : d
        );
        return updatedDialogues;
      });

      setCurrentDialogue(finalDialogue);

      // Update query cache
      queryClient.setQueryData(['dialogues', projectId], (oldData: QueryData | undefined) => {
        if (!oldData?.data) return oldData;
        return {
          ...oldData,
          data: oldData.data.map((d: BaseDialogue) => 
            d.dialogNumber === currentDialogue.dialogNumber ? finalDialogue : d
          )
        };
      });

      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 2000);

    } catch (error) {
      console.error('Process Voice - Error:', error);
      setError(error instanceof Error ? error.message : 'Failed to process voice conversion');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsProcessingVoice(false);
    }
  };

  // Handle synced playback with converted audio
  const handleConvertedAudioPlayback = async () => {
    console.log('Converted Audio Playback - Start:', {
      currentDialogue: {
        id: currentDialogue?.dialogNumber,
        hasVoiceId: !!currentDialogue?.voiceId,
        hasConvertedAudio: !!currentDialogue?.ai_converted_voiceover_url,
        audioUrl: currentDialogue?.ai_converted_voiceover_url
      },
      playbackState: {
        isPlaying,
        isPlayingConverted
      }
    });

    if (!currentDialogue?.ai_converted_voiceover_url || !videoRef.current) {
      console.error('Converted Audio Playback - Validation Error:', {
        hasConvertedAudio: !!currentDialogue?.ai_converted_voiceover_url,
        hasVideoRef: !!videoRef.current
      });
      return;
    }

    if (isPlayingConverted) {
      console.log('Converted Audio Playback - Stopping');
      // Stop both video and converted audio
      if (videoRef.current) {
        videoRef.current.pause();
      }
      if (convertedAudioRef.current) {
        convertedAudioRef.current.pause();
        convertedAudioRef.current = null;
      }
      setIsPlayingConverted(false);
      setIsPlaying(false);
      return;
    }

    try {
      console.log('Converted Audio Playback - Starting:', {
        audioUrl: currentDialogue.ai_converted_voiceover_url
      });

      // Create audio element for converted audio
      const audio = new Audio(currentDialogue.ai_converted_voiceover_url);
      convertedAudioRef.current = audio;

      // Set up cleanup on audio end
      audio.addEventListener('ended', () => {
        console.log('Converted Audio Playback - Ended');
        setIsPlayingConverted(false);
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

      console.log('Converted Audio Playback - Started Successfully');
      setIsPlayingConverted(true);
      setIsPlaying(true);
    } catch (error) {
      console.error('Converted Audio Playback - Error:', {
        error,
        message: error instanceof Error ? error.message : 'Failed to start converted audio playback'
      });
      setIsPlayingConverted(false);
      setIsPlaying(false);
      if (convertedAudioRef.current) {
        convertedAudioRef.current.pause();
        convertedAudioRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.muted = false;
      }
    }
  };

  // Clean up converted audio on unmount or dialogue change
  useEffect(() => {
    return () => {
      if (convertedAudioRef.current) {
        convertedAudioRef.current.pause();
        convertedAudioRef.current = null;
      }
    };
  }, [currentDialogue?._id]);

  // Modify the preview handler
  const handlePreviewVoice = async (model: VoiceModel) => {
    if (!currentDialogue?.recordedAudioUrl) {
      console.error('Preview Voice - No recorded audio:', {
        dialogueId: currentDialogue?.dialogNumber,
        character: currentDialogue?.characterName
      });
      setError('No recorded audio available for preview');
      return;
    }

    if (!project?.databaseName || !episode?.collectionName) {
      console.error('Preview Voice - Missing project info:', {
        databaseName: project?.databaseName,
        collectionName: episode?.collectionName
      });
      setError('Missing project information');
      return;
    }

    // Check if we have a stored preview for this dialogue
    const storedPreview = getStoredPreviewData(currentDialogue.dialogNumber);
    if (storedPreview) {
      console.log('Preview Voice - Using stored preview:', {
        dialogueId: currentDialogue.dialogNumber,
        previewUrl: storedPreview
      });
      setPreviewVoiceModel(model);
      setPreviewAudioUrl(storedPreview);
      return;
    }

    console.log('Preview Voice - Starting:', {
      dialogueId: currentDialogue.dialogNumber,
      character: currentDialogue.characterName,
      voiceModel: {
        id: model.id,
        name: model.name,
        verification: model.verification
      },
      audioUrl: currentDialogue.recordedAudioUrl
    });

    try {
      setIsPreviewProcessing(true);
      setPreviewVoiceModel(model);
      setPreviewAudioUrl(null);

      // Verify the recorded audio URL is accessible
      const audioResponse = await fetch(currentDialogue.recordedAudioUrl, { method: 'HEAD' });
      if (!audioResponse.ok) {
        throw new Error('Source audio file not accessible');
      }

      // Process the voice conversion
      const { data } = await axios.post('/api/voice-models/speech-to-speech', {
        voiceId: model.id,
        recordedAudioUrl: currentDialogue.recordedAudioUrl,
        dialogueNumber: currentDialogue.dialogNumber,
        characterName: currentDialogue.characterName,
        projectName: project.databaseName,
        episodeName: episode.collectionName,
        outputPath: `${project.databaseName}/${episode.collectionName}/converted_audio/${currentDialogue.characterName.toLowerCase()}/${currentDialogue.dialogNumber}.wav`,
        r2BaseUrl: R2_BASE_URL,
        previewOnly: true
      });

      console.log('Preview Voice - API Response:', {
        success: data.success,
        dialogueId: currentDialogue.dialogNumber,
        response: data
      });

      if (!data.success) {
        throw new Error('Voice conversion failed: ' + (data.error || 'Conversion unsuccessful'));
      }

      // Construct the converted audio URL
      let convertedAudioUrl;
      if (data.convertedAudioUrl) {
        // Use provided URL if it exists
        convertedAudioUrl = data.convertedAudioUrl.startsWith('http') 
          ? data.convertedAudioUrl 
          : `${R2_BASE_URL}/${data.convertedAudioUrl.replace(/^\/+/, '')}`;
      } else {
        // Construct URL from output path if no URL provided
        convertedAudioUrl = `${R2_BASE_URL}/${project.databaseName}/${episode.collectionName}/converted_audio/preview/${currentDialogue.dialogNumber}.wav`;
      }

      console.log('Preview Voice - Waiting for converted audio:', {
        dialogueId: currentDialogue.dialogNumber,
        convertedUrl: convertedAudioUrl
      });

      // Poll for the converted audio file
      const isFileAvailable = await pollForAudioFile(convertedAudioUrl);
      
      if (!isFileAvailable) {
        throw new Error('Timeout waiting for converted audio file');
      }

      // Store the preview URL in localStorage
      storePreviewData(currentDialogue.dialogNumber, convertedAudioUrl);

      // Set the preview URL
      setPreviewAudioUrl(convertedAudioUrl);

      console.log('Preview Voice - Successfully completed:', {
        dialogueId: currentDialogue.dialogNumber,
        convertedUrl: convertedAudioUrl
      });

    } catch (error) {
      console.error('Preview Voice - Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        dialogueId: currentDialogue.dialogNumber,
        voiceModel: model.id
      });

      setError(error instanceof Error ? error.message : 'Failed to preview voice conversion');
    } finally {
      setIsPreviewProcessing(false);
    }
  };

  // Modify the handleClearPreview function
  const handleClearPreview = () => {
    setPreviewVoiceModel(null);
    setPreviewAudioUrl(null);
    clearPreviewData();
  };

  // Add cleanup effect for preview data
  useEffect(() => {
    return () => {
      clearPreviewData();
    };
  }, []);

  // Add effect to check for stored preview when dialogue changes
  useEffect(() => {
    if (currentDialogue) {
      const storedPreview = getStoredPreviewData(currentDialogue.dialogNumber);
      if (storedPreview && previewVoiceModel) {
        setPreviewAudioUrl(storedPreview);
      } else {
        setPreviewAudioUrl(null);
        setPreviewVoiceModel(null);
      }
    }
  }, [currentDialogue?.dialogNumber]);

  // Modify handleVideoWithConvertedAudio to ensure URL is complete
  const handleVideoWithConvertedAudio = async () => {
    console.log('AI Converted Audio Playback - Initial State:', {
      dialogue: {
        id: currentDialogue?.dialogNumber,
        hasConvertedAudio: !!currentDialogue?.ai_converted_voiceover_url,
        convertedAudioUrl: currentDialogue?.ai_converted_voiceover_url,
        character: currentDialogue?.character
      },
      video: {
        exists: !!videoRef.current,
        currentTime: videoRef.current?.currentTime,
        duration: videoRef.current?.duration,
        paused: videoRef.current?.paused,
        muted: videoRef.current?.muted
      },
      playbackState: {
        isPlaying,
        isPlayingVideoWithConverted,
        hasAudioRef: !!convertedAudioRef.current
      }
    });

    if (!currentDialogue?.ai_converted_voiceover_url || !videoRef.current) {
      console.error('AI Converted Audio Playback - Validation Failed:', {
        hasConvertedAudio: !!currentDialogue?.ai_converted_voiceover_url,
        hasVideoRef: !!videoRef.current,
        dialogueId: currentDialogue?.dialogNumber
      });
      return;
    }

    if (isPlayingVideoWithConverted) {
      console.log('AI Converted Audio Playback - Stopping Playback');
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.muted = false;
      }
      if (convertedAudioRef.current) {
        convertedAudioRef.current.pause();
        convertedAudioRef.current = null;
      }
      setIsPlayingVideoWithConverted(false);
      setIsPlaying(false);
      return;
    }

    try {
      // Ensure we have the complete URL
      const audioUrl = currentDialogue.ai_converted_voiceover_url.startsWith('http')
        ? currentDialogue.ai_converted_voiceover_url
        : `${R2_BASE_URL}/${currentDialogue.ai_converted_voiceover_url.replace(/^\/+/, '')}`;

      // Validate audio URL before playing
      const response = await fetch(audioUrl, { method: 'HEAD' });
      if (!response.ok) {
        throw new Error('Audio file not found or inaccessible');
      }

      console.log('AI Converted Audio Playback - Starting:', {
        audioUrl,
        videoState: {
          ready: videoRef.current.readyState,
          duration: videoRef.current.duration,
          muted: videoRef.current.muted
        }
      });

      // Create and load audio element with complete URL
      const audio = new Audio(audioUrl);
      
      // Wait for audio to be loaded
      await new Promise((resolve, reject) => {
        audio.addEventListener('loadedmetadata', resolve);
        audio.addEventListener('error', () => reject(new Error('Failed to load audio')));
      });

      // Ensure video is muted
      videoRef.current.muted = true;
      convertedAudioRef.current = audio;

      // Set up cleanup on audio end
      audio.addEventListener('ended', () => {
        console.log('AI Converted Audio Playback - Ended');
        setIsPlayingVideoWithConverted(false);
        setIsPlaying(false);
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.muted = false;
        }
      });

      // Reset positions and start playback
      videoRef.current.currentTime = 0;
      audio.currentTime = 0;
      
      await Promise.all([
        videoRef.current.play(),
        audio.play()
      ]);

      setIsPlayingVideoWithConverted(true);
      setIsPlaying(true);

    } catch (error) {
      console.error('AI Converted Audio Playback - Error:', {
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        audioUrl: currentDialogue?.ai_converted_voiceover_url,
        videoState: {
          ready: videoRef.current?.readyState,
          duration: videoRef.current?.duration,
          muted: videoRef.current?.muted
        }
      });

      setError(error instanceof Error ? error.message : 'Failed to play converted audio');
      setTimeout(() => setError(''), 3000);

      setIsPlayingVideoWithConverted(false);
      setIsPlaying(false);
      if (convertedAudioRef.current) {
        convertedAudioRef.current.pause();
        convertedAudioRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.muted = false;
      }
    }
  };

  // Modify handleBulkVoiceUpdate to only verify current dialogue
  const handleBulkVoiceUpdate = async () => {
    if (!selectedCharacter) {
      setError('Please select a character first');
      return;
    }

    if (!currentDialogue) {
      setError('No dialogue selected');
      return;
    }

    const isRemovingVoices = !selectedVoiceModel || selectedVoiceModel.id === '';

    try {
      setIsProcessingBulkVoiceUpdate(true);
      
      const characterDialogues = dialogues.filter(d => d.characterName === selectedCharacter);
      
      console.log('Bulk Voice Update - Initial State:', {
        operation: isRemovingVoices ? 'remove' : 'assign',
        character: selectedCharacter,
        totalDialogues: characterDialogues.length,
        dialoguesWithVoice: characterDialogues.filter(d => d.voiceId).length,
        dialoguesWithoutVoice: characterDialogues.filter(d => !d.voiceId).length
      });

      // Only verify the current dialogue
      const verificationResult = verifyVoiceAssignment(currentDialogue, isRemovingVoices ? null : selectedVoiceModel);
      if (!verificationResult.isValid) {
        console.error('Bulk Voice Update - Verification Failed:', {
          dialogueId: currentDialogue.dialogNumber,
          error: verificationResult.error,
          status: currentDialogue.status
        });
        setError(verificationResult.error || 'Voice assignment verification failed');
        return;
      }

      console.log('Bulk Voice Update - Starting:', {
        operation: isRemovingVoices ? 'remove' : 'assign',
        character: selectedCharacter,
        selectedVoiceId: selectedVoiceModel?.id,
        totalDialogues: characterDialogues.length,
        currentDialogueId: currentDialogue.dialogNumber
      });

      let successCount = 0;
      let failureCount = 0;
      let updatedDialogues: SrDirectorDialogue[] = [...dialogues];
      
      for (const dialogue of characterDialogues) {
        // Skip if already in desired state
        if (isRemovingVoices && !dialogue.voiceId) {
          console.log('Bulk Voice Update - Skipping (already removed):', {
            dialogueNumber: dialogue.dialogNumber
          });
          successCount++;
          continue;
        }

        console.log('Bulk Voice Update - Processing Dialogue:', {
          dialogueNumber: dialogue.dialogNumber,
          character: dialogue.characterName,
          currentVoiceId: dialogue.voiceId,
          hasConvertedAudio: !!dialogue.ai_converted_voiceover_url,
          status: dialogue.status,
          operation: isRemovingVoices ? 'remove' : 'assign new voice'
        });

        try {
          if (isRemovingVoices) {
            const response = await fetch(
              `/api/dialogues/remove-voice/${dialogue.dialogNumber}?` + 
              new URLSearchParams({
                projectId,
                databaseName: project?.databaseName || '',
                collectionName: episode?.collectionName || ''
              }),
              {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json'
                }
              }
            );

            const data = await response.json();

            if (!response.ok) {
              throw new Error(data.error || 'Failed to remove voice ID');
            }

            // Verify the response indicates successful removal
            if (!data.success) {
              throw new Error('Voice removal was not successful');
            }

            console.log('Bulk Voice Update - Voice removed:', {
              dialogueNumber: dialogue.dialogNumber,
              previousVoiceId: dialogue.voiceId,
              response: data
            });

            // Update the dialogue in our local array
            updatedDialogues = updatedDialogues.map(d => 
              d.dialogNumber === dialogue.dialogNumber 
                ? { 
                    ...d, 
                    voiceId: undefined,
                    ai_converted_voiceover_url: undefined
                  }
                : d
            );

            successCount++;

          } else if (selectedVoiceModel) {
            const dialogueComponents = dialogue.dialogNumber.split('.');
            const sceneNumber = dialogueComponents[2];

            const updateData = {
              _id: dialogue.dialogNumber,
              dialogue: dialogue.dialogue,
              character: dialogue.character,
              characterName: dialogue.characterName,
              status: dialogue.status || 'pending',
              timeStart: dialogue.timeStart,
              timeEnd: dialogue.timeEnd,
              index: dialogue.index,
              recordedAudioUrl: dialogue.recordedAudioUrl || null,
              voiceOverNotes: dialogue.voiceOverNotes,
              revisionRequested: dialogue.revisionRequested,
              needsReRecord: dialogue.needsReRecord,
              databaseName: project?.databaseName,
              collectionName: episode?.collectionName,
              subtitleIndex: dialogue.subtitleIndex,
              dialogNumber: dialogue.dialogNumber,
              projectId,
              sceneNumber,
              voiceId: selectedVoiceModel.id,
              ai_converted_voiceover_url: dialogue.ai_converted_voiceover_url
            };

            const response = await axios.patch(
              `/api/dialogues/update/${dialogue.dialogNumber}`,
              updateData,
              {
                headers: {
                  'Content-Type': 'application/json',
                },
                params: {
                  databaseName: project?.databaseName,
                  collectionName: episode?.collectionName,
                  projectId
                }
              }
            );

            updatedDialogues = updatedDialogues.map(d => 
              d.dialogNumber === dialogue.dialogNumber 
                ? { ...d, voiceId: selectedVoiceModel.id }
                : d
            );

            successCount++;
            console.log('Bulk Voice Update - Voice assigned:', {
              dialogueNumber: dialogue.dialogNumber,
              voiceId: selectedVoiceModel.id
            });
          }

        } catch (error) {
          console.error('Bulk Voice Update - Error:', {
            dialogueNumber: dialogue.dialogNumber,
            status: dialogue.status,
            currentVoiceId: dialogue.voiceId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          failureCount++;
        }
      }

      // Update state only once after all operations are complete
      setDialogues(updatedDialogues);

      // Update current dialogue if it was modified
      if (currentDialogue) {
        const updatedCurrentDialogue = updatedDialogues.find(
          d => d.dialogNumber === currentDialogue.dialogNumber
        );
        if (updatedCurrentDialogue) {
          setCurrentDialogue(updatedCurrentDialogue);
        }
      }

      // Force a fresh fetch of the data to ensure sync with server
      await queryClient.invalidateQueries(['dialogues', projectId]);

      console.log('Bulk Voice Update - Completed:', {
        totalProcessed: characterDialogues.length,
        successCount,
        failureCount,
        operation: isRemovingVoices ? 'remove' : 'assign',
        character: selectedCharacter
      });

      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 2000);

      if (failureCount > 0) {
        setError(`${failureCount} dialogue(s) failed to update. Check console for details.`);
        setTimeout(() => setError(''), 3000);
      }

    } catch (error) {
      console.error('Bulk Voice Update - Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        character: selectedCharacter
      });
      setError(error instanceof Error ? error.message : 'Failed to update voices');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsProcessingBulkVoiceUpdate(false);
    }
  };

  // Update video element to show loading state
  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Top Header Bar */}
      <div className="w-full bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Dialogue Review Interface
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs dark:bg-blue-900 dark:text-blue-200">
                Pending: {dialoguesList.filter(d => !d.revisionRequested && !d.needsReRecord).length}
              </span>
              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs dark:bg-yellow-900 dark:text-yellow-200">
                Revision: {dialoguesList.filter(d => d.revisionRequested).length}
              </span>
              <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs dark:bg-red-900 dark:text-red-200">
                Re-record: {dialoguesList.filter(d => d.needsReRecord).length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - 1/4 width */}
        <div className="w-1/4 flex flex-col relative bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          {/* Characters Section - Top Half */}
          <div className="h-1/2 border-b border-gray-200 dark:border-gray-700">
            <div className="h-full flex flex-col">
              <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex-none">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">Characters</h3>
                  {selectedCharacter && (
                    <button
                      onClick={handleClearCharacterSelection}
                      className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={characterSearchQuery}
                    onChange={(e) => setCharacterSearchQuery(e.target.value)}
                    placeholder="Search characters..."
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  />
                  {characterSearchQuery && (
                    <button
                      onClick={() => setCharacterSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
                <div className="space-y-1">
                  {filteredCharacters.map(([character, dialogues]) => {
                    const dialoguesWithVoice = dialogues.filter(d => d.voiceId);
                    const voiceAssignmentPercentage = Math.round((dialoguesWithVoice.length / dialogues.length) * 100);
                    const hasVoiceAssigned = dialoguesWithVoice.length > 0;
                    const allSameVoice = dialoguesWithVoice.every(d => d.voiceId === dialoguesWithVoice[0]?.voiceId);
                    const voiceModel = allSameVoice && hasVoiceAssigned ? 
                      allVoiceModels.find(m => m.id === dialoguesWithVoice[0]?.voiceId)?.name : null;

                    return (
                      <button
                        key={character}
                        onClick={() => handleCharacterSelection(character, dialogues)}
                        className={`w-full px-3 py-2 rounded text-left text-sm ${
                          selectedCharacter === character
                            ? 'bg-blue-500 text-white'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">{character}</div>
                            <div className="text-xs opacity-80">{dialogues.length} lines</div>
                          </div>
                          {hasVoiceAssigned && (
                            <div className={`text-xs px-1.5 py-0.5 rounded ${
                              selectedCharacter === character
                                ? 'bg-blue-400 text-white'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            }`}>
                              {voiceModel ? 
                                `${voiceModel}` : 
                                `${voiceAssignmentPercentage}% assigned`
                              }
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Voice Models Section - Bottom Half */}
          <div className="h-1/2">
            <div className="h-full flex flex-col">
              <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Voice Assignment</h3>
                
                {/* Voice Assignment Section */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300">Voice Models</h4>
                    <select
                      value={selectedGender}
                      className="text-xs border border-gray-300 rounded bg-white dark:bg-gray-700 px-2 py-1"
                      onChange={(e) => setSelectedGender(e.target.value)}
                    >
                      <option value="all">All</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="relative mb-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search voice models..."
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="max-h-[calc(100vh-400px)] overflow-y-auto scrollbar-thin">
                    {isLoadingVoices ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="animate-spin h-5 w-5 border-2 border-blue-500 rounded-full border-t-transparent"></div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Add Remove Voice Option */}
                        <div className="p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex-1">
                              <div className="font-medium flex items-center gap-1">
                                No Voice
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">Remove assigned voice</div>
                            </div>
                          </div>

                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleVoiceSelection({ id: '', name: '', category: '', fineTuning: { isAllowed: false, language: '' }, labels: { accent: null, description: null, age: null, gender: null, useCase: null }, description: '', previewUrl: '', supportedModels: [], verification: { required: false, verified: false } })}
                              className={`flex-1 px-2 py-1 text-xs rounded bg-gray-500 text-white hover:bg-gray-600`}
                            >
                              Remove Voice
                            </button>
                            <button
                              onClick={handleBulkVoiceUpdate}
                              disabled={isProcessingBulkVoiceUpdate}
                              className="flex-1 px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                            >
                              Remove from All
                            </button>
                          </div>
                        </div>

                        {/* Existing Voice Models */}
                        {filteredVoiceModels.map((model) => (
                          <div key={model.id} className="p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex-1">
                                <div className="font-medium flex items-center gap-1">
                                  {model.name}
                                  {model.verification.verified && (
                                    <span className="text-[10px] px-1 bg-green-100 text-green-800 rounded">✓</span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">ID: {model.id}</div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
                                  {model.category}
                                </span>
                                {model.labels.gender && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded">
                                    {model.labels.gender}
                                  </span>
                                )}
                              </div>
                            </div>

                            {model.previewUrl && (
                              <audio 
                                src={model.previewUrl} 
                                controls 
                                className="w-full h-6 mt-1"
                              />
                            )}

                            {/* Preview section */}
                            {previewVoiceModel?.id === model.id && previewAudioUrl && (
                              <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded">
                                <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Preview:</div>
                                <audio 
                                  src={previewAudioUrl} 
                                  controls 
                                  className="w-full h-6"
                                />
                              </div>
                            )}

                            <div className="flex gap-2 mt-2">
                              {previewVoiceModel?.id === model.id ? (
                                <>
                                  <button
                                    onClick={() => handleVoiceSelection(model)}
                                    className="flex-1 px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                                  >
                                    Assign Voice
                                  </button>
                                  <button
                                    onClick={handleBulkVoiceUpdate}
                                    disabled={isProcessingBulkVoiceUpdate}
                                    className="flex-1 px-2 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
                                  >
                                    Assign to All
                                  </button>
                                  <button
                                    onClick={handleClearPreview}
                                    className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handlePreviewVoice(model)}
                                  disabled={isPreviewProcessing}
                                  className={`flex-1 px-2 py-1 text-xs rounded ${
                                    isPreviewProcessing 
                                      ? 'bg-gray-400 cursor-not-allowed'
                                      : 'bg-blue-500 hover:bg-blue-600'
                                  } text-white`}
                                >
                                  {isPreviewProcessing ? 'Processing...' : 'Preview Voice'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - 3/4 width */}
        <div className="w-3/4 overflow-y-auto scrollbar-thin">
          {!selectedCharacter ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Select a Character
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Choose a character from the list to start reviewing
                </p>
              </div>
            </div>
          ) : !currentDialogue ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No Dialogues Available
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No dialogues available for {selectedCharacter}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Character Header */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {selectedCharacter}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Dialogue {currentDialogueIndex + 1} of {filteredDialogues.length}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={dialogueFilter}
                      onChange={(e) => {
                        setDialogueFilter(e.target.value);
                        setCurrentDialogueIndex(0);
                      }}
                      className="text-sm border border-gray-300 rounded bg-white dark:bg-gray-700 px-2 py-1"
                    >
                      <option value="all">All Dialogues</option>
                      <option value="pending">Pending Review</option>
                      <option value="revision">Needs Revision</option>
                      <option value="rerecord">Needs Re-record</option>
                    </select>
                    <div className="flex gap-1">
                      <button
                        onClick={handlePrevious}
                        disabled={currentDialogueIndex === 0}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        ←
                      </button>
                      <button
                        onClick={handleNext}
                        disabled={currentDialogueIndex === (filteredDialogues.length - 1)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        →
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Video Player */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="aspect-video bg-black relative">
                  {videoLoadingStates[currentDialogue.dialogNumber] && !videoError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
                      <div className="text-white text-sm">Loading video...</div>
                    </div>
                  )}
                  {videoError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-900 bg-opacity-50">
                      <div className="text-white text-sm px-4 text-center">{videoError}</div>
                    </div>
                  )}
                  <video
                    ref={videoRef}
                    src={currentDialogue?.videoUrl}
                    className="w-full h-full object-contain"
                    onLoadStart={() => handleVideoLoadStart(currentDialogue.dialogNumber)}
                    onLoadedData={() => handleVideoLoad(currentDialogue.dialogNumber)}
                    onError={(e) => handleVideoError(e, currentDialogue.dialogNumber)}
                    preload="auto"
                  />
                </div>
                <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {/* Video Controls */}
                    <div className="flex items-center gap-1 border-r pr-2 border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
                          }
                        }}
                        className="px-2 py-1 bg-blue-500 text-white text-xs rounded"
                      >
                        -5s
                      </button>
                      <button
                        onClick={handleVideoPlayPause}
                        disabled={!isVideoReady || !!videoError}
                        className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 disabled:opacity-50"
                      >
                        {isPlaying ? '⏸' : '▶'} Video
                        {videoError && <span className="ml-1 text-red-200">⚠️</span>}
                      </button>
                      <button
                        onClick={() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 5);
                          }
                        }}
                        className="px-2 py-1 bg-blue-500 text-white text-xs rounded"
                      >
                        +5s
                      </button>
                    </div>

                    {/* Voice-over Controls */}
                    {currentDialogue?.recordedAudioUrl && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleSyncedPlayback}
                          className="px-2 py-1 bg-purple-500 text-white text-xs rounded"
                        >
                          {isSyncedPlaying ? 'Stop Recorded Audio' : 'Play Recorded Audio'}
                        </button>
                        {currentDialogue.ai_converted_voiceover_url && (
                          <button
                            onClick={handleVideoWithConvertedAudio}
                            className="px-2 py-1 bg-indigo-500 text-white text-xs rounded"
                          >
                            {isPlayingVideoWithConverted ? 'Stop AI Audio' : 'AI Converted Audio'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Playback Speed */}
                    <div className="flex items-center gap-1 text-xs border-l pl-2 border-gray-200 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">Speed:</span>
                      {[0.5, 0.75, 1, 1.25, 1.5].map((rate) => (
                        <button
                          key={rate}
                          onClick={() => {
                            if (videoRef.current) {
                              videoRef.current.playbackRate = rate;
                              if (convertedAudioRef.current) {
                                convertedAudioRef.current.playbackRate = rate;
                              }
                              if (audioRef.current) {
                                audioRef.current.playbackRate = rate;
                              }
                              setPlaybackRate(rate);
                            }
                          }}
                          className={`px-1.5 py-0.5 rounded ${
                            playbackRate === rate
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Dialogue Info */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">Dialogue Information</h4>
                  {/* Bulk AI Conversion Button */}
                  {selectedCharacter && (
                    <button
                      onClick={handleBulkVoiceUpdate}
                      disabled={isProcessingBulkVoiceUpdate}
                      className="px-3 py-1.5 text-sm bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
                    >
                      {isProcessingBulkVoiceUpdate ? 'Converting All...' : 'Convert All Recorded Audio'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                      Original
                    </label>
                    <div className="text-sm p-2 rounded bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                      {currentDialogue?.dialogue.original}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                      Translated
                    </label>
                    <div className="text-sm p-2 rounded bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                      {currentDialogue?.dialogue.translated}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                      Adapted
                    </label>
                    <div className="text-sm p-2 rounded bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                      {currentDialogue?.dialogue.adapted}
                    </div>
                  </div>
                </div>

                {/* Audio Players */}
                {currentDialogue?.recordedAudioUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Original:</span>
                      <audio 
                        controls 
                        src={currentDialogue.recordedAudioUrl} 
                        className="flex-1 h-8"
                      />
                    </div>
                    {currentDialogue.ai_converted_voiceover_url && (
                      <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/30 rounded">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">AI Voice:</span>
                        <audio 
                          controls 
                          src={currentDialogue.ai_converted_voiceover_url}
                          className="flex-1 h-8"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Review Controls */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={revisionRequested}
                        onChange={(e) => setRevisionRequested(e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Needs Revision</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={needsReRecord}
                        onChange={(e) => setNeedsReRecord(e.target.checked)}
                        className="w-4 h-4 text-purple-600 rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Needs Re-record</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Single Dialogue Conversion Button */}
                    {currentDialogue?.recordedAudioUrl && !currentDialogue?.ai_converted_voiceover_url && (
                      <button
                        onClick={handleProcessVoice}
                        disabled={isProcessingVoice}
                        className="px-3 py-1.5 bg-indigo-500 text-white text-sm rounded hover:bg-indigo-600 disabled:opacity-50"
                      >
                        {isProcessingVoice ? 'Converting...' : 'Convert Audio'}
                      </button>
                    )}
                    <button
                      onClick={handleApproveAndSave}
                      disabled={isSaving}
                      className="px-3 py-1.5 bg-green-500 text-white text-sm rounded hover:bg-green-600 disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : revisionRequested ? 'Request Revision' : 'Approve'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Feedback Messages */}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {isSaving && (
          <div className="bg-blue-500 text-white px-3 py-1.5 rounded text-sm shadow-lg">
            Saving review...
          </div>
        )}
        {showSaveSuccess && (
          <div className="bg-green-500 text-white px-3 py-1.5 rounded text-sm shadow-lg">
            Saved successfully!
          </div>
        )}
        {error && (
          <div className="bg-red-500 text-white px-3 py-1.5 rounded text-sm shadow-lg">
            {error}
          </div>
        )}
      </div>
    </div>
  )
} 