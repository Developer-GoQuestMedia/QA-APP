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
  voiceId?: string;
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
  voiceId?: string;
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
        const response = await fetch('/api/voice-models/available');
        const data = await response.json();
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
      setCurrentDialogue(firstDialogue);
      setRevisionRequested(firstDialogue.revisionRequested || false);
      setNeedsReRecord(firstDialogue.needsReRecord || false);
    } else {
      console.log('Character Selection - No dialogues available for character');
      setCurrentDialogue(null);
    }
  }, []);

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

  // Modify handleVoiceSelection to update the current dialogue
  const handleVoiceSelection = async (model: VoiceModel) => {
    console.log('Voice Selection - Start:', {
      selectedModel: model,
      currentModel: selectedVoiceModel,
      currentDialogue: {
        id: currentDialogue?.dialogNumber,
        hasRecordedAudio: !!currentDialogue?.recordedAudioUrl,
        hasConvertedAudio: !!currentDialogue?.ai_converted_voiceover_url,
        voiceId: currentDialogue?.voiceId
      }
    });

    // Update the selected model
    setSelectedVoiceModel(model);

    // Update current dialogue with the new voice ID
    if (currentDialogue) {
      const updatedDialogue = {
        ...currentDialogue,
        voiceId: model.id
      };
      setCurrentDialogue(updatedDialogue);

      // Update dialogues list
      setDialogues(prevDialogues => 
        prevDialogues.map(d => 
          d.dialogNumber === currentDialogue.dialogNumber ? updatedDialogue : d
        )
      );

      console.log('Voice Selection - Updated Current Dialogue:', {
        dialogueNumber: currentDialogue.dialogNumber,
        previousVoiceId: currentDialogue.voiceId,
        newVoiceId: model.id
      });
    }

    console.log('Voice Selection - Complete:', {
      newSelectedModel: model.id,
      currentDialogueVoiceId: currentDialogue?.voiceId
    });
  };

  // Add new function to process voice conversion
  const handleProcessVoice = async () => {
    console.log('Process Voice - Start:', {
      selectedModel: selectedVoiceModel,
      currentDialogue: {
        id: currentDialogue?.dialogNumber,
        hasRecordedAudio: !!currentDialogue?.recordedAudioUrl,
        hasConvertedAudio: !!currentDialogue?.ai_converted_voiceover_url,
        voiceId: currentDialogue?.voiceId
      }
    });

    if (!selectedVoiceModel || !currentDialogue?.recordedAudioUrl) {
      const error = 'Please select a voice model and ensure there is recorded audio';
      console.error('Process Voice - Validation Error:', {
        hasSelectedModel: !!selectedVoiceModel,
        hasRecordedAudio: !!currentDialogue?.recordedAudioUrl
      });
      setError(error);
      return;
    }

    try {
      setIsProcessingVoice(true);
      
      const response = await fetch('/api/voice-models/speech-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voiceId: selectedVoiceModel.id,
          recordedAudioUrl: currentDialogue.recordedAudioUrl,
          dialogueNumber: currentDialogue.dialogNumber
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process voice conversion');
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error('Failed to process voice conversion');
      }

      // Log the response data from voice processing
      console.log('Voice Processing - API Response:', {
        success: data.success,
        audioUrl: data.audioUrl,
        dialogueNumber: currentDialogue.dialogNumber
      });

      // Create the complete updated dialogue object
      const dialogueComponents = currentDialogue.dialogNumber.split('.');
      const sceneNumber = dialogueComponents[2];

      const updatedDialogue = {
        _id: currentDialogue.dialogNumber,
        dialogue: currentDialogue.dialogue,
        character: currentDialogue.character,
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
        characterName: currentDialogue.characterName,
        dialogNumber: currentDialogue.dialogNumber,
        projectId,
        sceneNumber,
        voiceId: selectedVoiceModel.id,
        ai_converted_voiceover_url: data.audioUrl
      };

      // Log the update payload
      console.log('Database Update - Request Payload:', {
        dialogueNumber: currentDialogue.dialogNumber,
        updateData: {
          voiceId: updatedDialogue.voiceId,
          ai_converted_voiceover_url: updatedDialogue.ai_converted_voiceover_url,
          databaseName: updatedDialogue.databaseName,
          collectionName: updatedDialogue.collectionName
        }
      });

      // Update the dialogue in the database
      const { data: responseData } = await axios.patch(
        `/api/dialogues/update/${currentDialogue.dialogNumber}`,
        updatedDialogue,
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

      // Log the database response
      console.log('Database Update - Response:', {
        success: true,
        dialogueNumber: responseData.dialogNumber,
        voiceId: responseData.voiceId,
        ai_converted_voiceover_url: responseData.ai_converted_voiceover_url,
        updatedAt: responseData.updatedAt
      });

      // Create a new dialogue object with updated fields
      const finalDialogue = {
        ...currentDialogue,
        voiceId: selectedVoiceModel.id,
        ai_converted_voiceover_url: data.audioUrl
      };

      console.log('State Update - Before:', {
        dialogueNumber: currentDialogue.dialogNumber,
        previousVoiceId: currentDialogue.voiceId,
        previousConvertedAudio: currentDialogue.ai_converted_voiceover_url
      });

      // Update dialogues list
      setDialogues(prevDialogues => {
        const updatedDialogues = prevDialogues.map(d => 
          d.dialogNumber === currentDialogue.dialogNumber ? finalDialogue : d
        );
        console.log('State Update - Dialogues List:', {
          totalDialogues: updatedDialogues.length,
          updatedDialogue: updatedDialogues.find(d => d.dialogNumber === currentDialogue.dialogNumber)
        });
        return updatedDialogues;
      });

      // Update current dialogue
      setCurrentDialogue(finalDialogue);

      // Update query cache
      queryClient.setQueryData(['dialogues', projectId], (oldData: QueryData | undefined) => {
        if (!oldData?.data) return oldData;
        const updatedData = {
          ...oldData,
          data: oldData.data.map((d: BaseDialogue) => 
            d.dialogNumber === currentDialogue.dialogNumber ? finalDialogue : d
          )
        };
        console.log('Query Cache Update:', {
          dialogueNumber: currentDialogue.dialogNumber,
          updatedDialogue: updatedData.data.find((d) => 
            (d as BaseDialogue).dialogNumber === currentDialogue.dialogNumber
          ) as typeof finalDialogue | undefined
        });
        return updatedData;
      });

      console.log('State Update - After:', {
        dialogueNumber: finalDialogue.dialogNumber,
        newVoiceId: finalDialogue.voiceId,
        newConvertedAudio: finalDialogue.ai_converted_voiceover_url,
        timestamp: new Date().toISOString()
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

  // Update handleVideoWithConvertedAudio function
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
      console.log('AI Converted Audio Playback - Stopping Playback:', {
        videoState: {
          currentTime: videoRef.current.currentTime,
          duration: videoRef.current.duration,
          muted: videoRef.current.muted
        },
        audioState: {
          exists: !!convertedAudioRef.current,
          currentTime: convertedAudioRef.current?.currentTime
        }
      });

      // Stop playback
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.muted = false; // Unmute video when stopping
        console.log('Video playback stopped and unmuted');
      }
      if (convertedAudioRef.current) {
        convertedAudioRef.current.pause();
        convertedAudioRef.current = null;
        console.log('Audio playback stopped and reference cleared');
      }
      setIsPlayingVideoWithConverted(false);
      setIsPlaying(false);
      return;
    }

    try {
      // Ensure video is muted before starting
      if (videoRef.current) {
        videoRef.current.muted = true;
        console.log('Video muted before playback');
      }

      console.log('AI Converted Audio Playback - Starting:', {
        audioUrl: currentDialogue.ai_converted_voiceover_url,
        videoState: {
          ready: videoRef.current.readyState,
          duration: videoRef.current.duration,
          muted: videoRef.current.muted
        }
      });

      // Create audio element for converted audio
      const audio = new Audio(currentDialogue.ai_converted_voiceover_url);
      
      // Add loadedmetadata event listener
      await new Promise((resolve, reject) => {
        audio.addEventListener('loadedmetadata', () => {
          console.log('AI Converted Audio - Metadata Loaded:', {
            audioDuration: audio.duration,
            videoDuration: videoRef.current?.duration,
            videoMuted: videoRef.current?.muted
          });
          resolve(true);
        });
        
        audio.addEventListener('error', (e) => {
          console.error('AI Converted Audio - Load Error:', {
            error: e,
            audioUrl: currentDialogue.ai_converted_voiceover_url
          });
          reject(new Error('Failed to load audio'));
        });
      });

      convertedAudioRef.current = audio;

      // Set up cleanup on audio end
      audio.addEventListener('ended', () => {
        console.log('AI Converted Audio Playback - Ended:', {
          audioTime: audio.currentTime,
          videoTime: videoRef.current?.currentTime,
          videoMuted: videoRef.current?.muted
        });
        setIsPlayingVideoWithConverted(false);
        setIsPlaying(false);
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.muted = false; // Unmute video when finished
        }
      });

      // Add progress logging with sync adjustment
      audio.addEventListener('timeupdate', () => {
        if (videoRef.current && Math.abs(audio.currentTime - videoRef.current.currentTime) > 0.1) {
          // Adjust video time if it gets out of sync by more than 100ms
          videoRef.current.currentTime = audio.currentTime;
        }
        console.log('AI Converted Audio - Progress:', {
          audioTime: audio.currentTime,
          videoTime: videoRef.current?.currentTime,
          syncDiff: Math.abs(audio.currentTime - (videoRef.current?.currentTime || 0)),
          videoMuted: videoRef.current?.muted
        });
      });

      // Reset both video and audio to start
      videoRef.current.currentTime = 0;
      audio.currentTime = 0;
      
      console.log('Starting synchronized playback');
      
      // Start playback ensuring video is muted
      videoRef.current.muted = true;
      await Promise.all([
        videoRef.current.play().then(() => console.log('Video playback started (muted)')),
        audio.play().then(() => console.log('Audio playback started'))
      ]);

      console.log('AI Converted Audio Playback - Started Successfully:', {
        audioState: {
          duration: audio.duration,
          currentTime: audio.currentTime
        },
        videoState: {
          duration: videoRef.current.duration,
          currentTime: videoRef.current.currentTime,
          muted: videoRef.current.muted
        }
      });

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

      setIsPlayingVideoWithConverted(false);
      setIsPlaying(false);
      if (convertedAudioRef.current) {
        convertedAudioRef.current.pause();
        convertedAudioRef.current = null;
        console.log('Audio reference cleared after error');
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.muted = false; // Ensure video is unmuted after error
        console.log('Video stopped and unmuted after error');
      }
    }
  };

  // Modify handleBulkVoiceUpdate to assign voice ID without requiring audio
  const handleBulkVoiceUpdate = async () => {
    if (!selectedVoiceModel || !selectedCharacter) {
      console.error('Bulk Voice Update - Invalid State:', {
        hasSelectedModel: !!selectedVoiceModel,
        selectedCharacter,
        selectedVoiceId: selectedVoiceModel?.id
      });
      return;
    }

    try {
      setIsProcessingBulkVoiceUpdate(true);
      
      // Get all dialogues for the selected character
      const characterDialogues = dialogues.filter(d => d.characterName === selectedCharacter);
      
      console.log('Bulk Voice Update - Starting:', {
        character: selectedCharacter,
        selectedVoiceId: selectedVoiceModel.id,
        totalDialogues: characterDialogues.length,
        projectContext: {
          databaseName: project?.databaseName,
          collectionName: episode?.collectionName,
          projectId
        }
      });

      // Create a new array to track updated dialogues
      let updatedDialoguesList = [...dialogues];

      // Update each dialogue with the selected voice ID
      const updateResults = await Promise.all(characterDialogues.map(async (dialogue) => {
        const dialogueComponents = dialogue.dialogNumber.split('.');
        const sceneNumber = dialogueComponents[2];

        console.log('Bulk Voice Update - Processing Dialogue:', {
          dialogueNumber: dialogue.dialogNumber,
          character: dialogue.characterName,
          currentVoiceId: dialogue.voiceId,
          newVoiceId: selectedVoiceModel.id,
          hasRecordedAudio: !!dialogue.recordedAudioUrl,
          hasConvertedAudio: !!dialogue.ai_converted_voiceover_url
        });

        const updateData = {
          _id: dialogue.dialogNumber,
          dialogue: dialogue.dialogue,
          character: dialogue.character,
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
          characterName: dialogue.characterName,
          dialogNumber: dialogue.dialogNumber,
          projectId,
          sceneNumber,
          voiceId: selectedVoiceModel.id,
          ai_converted_voiceover_url: dialogue.ai_converted_voiceover_url || null
        };

        try {
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

          // Verify the response contains the voice ID
          if (response.data?.voiceId !== selectedVoiceModel.id) {
            console.error('Bulk Voice Update - Voice ID Mismatch:', {
              dialogueNumber: dialogue.dialogNumber,
              expectedVoiceId: selectedVoiceModel.id,
              receivedVoiceId: response.data?.voiceId
            });
            return { success: false, dialogueNumber: dialogue.dialogNumber, error: 'Voice ID mismatch' };
          }

          // Update the dialogue in our tracking array
          updatedDialoguesList = updatedDialoguesList.map(d => 
            d.dialogNumber === dialogue.dialogNumber 
              ? { ...d, voiceId: selectedVoiceModel.id }
              : d
          );

          console.log('Bulk Voice Update - Dialogue Updated:', {
            dialogueNumber: dialogue.dialogNumber,
            success: true,
            voiceId: response.data.voiceId,
            hasRecordedAudio: !!response.data.recordedAudioUrl,
            hasConvertedAudio: !!response.data.ai_converted_voiceover_url
          });

          return { success: true, dialogueNumber: dialogue.dialogNumber };
        } catch (error) {
          console.error('Bulk Voice Update - Dialogue Update Failed:', {
            dialogueNumber: dialogue.dialogNumber,
            error: error instanceof Error ? error.message : 'Unknown error',
            requestData: updateData
          });
          return { success: false, dialogueNumber: dialogue.dialogNumber, error };
        }
      }));

      // Update all dialogues at once
      setDialogues(updatedDialoguesList);

      const successCount = updateResults.filter(result => result.success).length;
      const failureCount = updateResults.filter(result => !result.success).length;

      console.log('Bulk Voice Update - Completed:', {
        totalProcessed: updateResults.length,
        successCount,
        failureCount,
        character: selectedCharacter,
        voiceId: selectedVoiceModel.id,
        results: updateResults
      });

      // Show success message
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 2000);

      // Force a full refresh of the dialogues list
      await queryClient.invalidateQueries(['dialogues', projectId]);

      // Verify the updates in the local state
      const verificationDialogues = updatedDialoguesList.filter(d => 
        d.characterName === selectedCharacter && d.voiceId === selectedVoiceModel.id
      );

      console.log('Bulk Voice Update - Verification:', {
        character: selectedCharacter,
        expectedVoiceId: selectedVoiceModel.id,
        totalDialogues: characterDialogues.length,
        updatedDialoguesCount: verificationDialogues.length,
        allUpdated: verificationDialogues.length === characterDialogues.length,
        verificationSample: verificationDialogues.slice(0, 3)
      });

    } catch (error) {
      console.error('Bulk Voice Update - Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        character: selectedCharacter,
        voiceId: selectedVoiceModel.id
      });
      setError(error instanceof Error ? error.message : 'Failed to update voice for all dialogues');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsProcessingBulkVoiceUpdate(false);
    }
  };

  // Add video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      setIsPlaying(false);
      setIsSyncedPlaying(false);
      setIsPlayingConverted(false);
      setIsPlayingVideoWithConverted(false);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handleError = (e: Event) => {
      const error = (e as ErrorEvent).message || 'Error playing video';
      setVideoError(error);
      setIsPlaying(false);
      console.error('Video playback error:', error);
    };

    const handleLoadedData = () => {
      setIsVideoReady(true);
      setVideoError(null);
    };

    video.addEventListener('ended', handleEnded);
    video.addEventListener('pause', handlePause);
    video.addEventListener('play', handlePlay);
    video.addEventListener('error', handleError);
    video.addEventListener('loadeddata', handleLoadedData);

    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('error', handleError);
      video.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [videoRef.current]);

  // Update video play/pause handler
  const handleVideoPlayPause = async () => {
    if (!videoRef.current) return;

    try {
      // Stop any other playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (convertedAudioRef.current) {
        convertedAudioRef.current.pause();
        convertedAudioRef.current = null;
      }

      // Reset all playback states
      setIsSyncedPlaying(false);
      setIsPlayingConverted(false);
      setIsPlayingVideoWithConverted(false);

      videoRef.current.muted = false;
      
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        try {
          await videoRef.current.play();
        } catch (error) {
          console.error('Failed to play video:', error);
          setVideoError(error instanceof Error ? error.message : 'Failed to play video');
          setIsPlaying(false);
        }
      }
    } catch (error) {
      console.error('Video playback error:', error);
      setVideoError(error instanceof Error ? error.message : 'Video playback error');
      setIsPlaying(false);
    }
  };

  if (!dialoguesList.length) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No Dialogues Available
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            There are no dialogues available for review.
          </p>
        </div>
      </div>
    );
  }

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
        {/* Left Sidebar */}
        <div className="w-72 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
          {/* Character Selection */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
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
            <div className="mb-2">
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
            <div className="space-y-1 max-h-[30vh] overflow-y-auto scrollbar-thin">
              {filteredCharacters.map(([character, dialogues]) => {
                // Calculate voice assignment stats for this character
                const dialoguesWithVoice = dialogues.filter(d => d.voiceId);
                const voiceAssignmentPercentage = Math.round((dialoguesWithVoice.length / dialogues.length) * 100);
                const hasVoiceAssigned = dialoguesWithVoice.length > 0;
                // Get the voice model name if all dialogues have the same voice ID
                const allSameVoice = dialoguesWithVoice.every(d => d.voiceId === dialoguesWithVoice[0]?.voiceId);
                const voiceModel = allSameVoice && hasVoiceAssigned ? 
                  allVoiceModels.find(m => m.id === dialoguesWithVoice[0]?.voiceId)?.name : null;

                return (
                  <button
                    key={character}
                    onClick={() => {
                      handleCharacterSelection(character, dialogues);
                    }}
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

          {/* Voice Models */}
          <div className="flex-1 p-3 overflow-y-auto scrollbar-thin">
            <div className="space-y-2 mb-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">Voice Models</h3>
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
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search voice models..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
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
            </div>

            {isLoadingVoices ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin h-5 w-5 border-2 border-blue-500 rounded-full border-t-transparent"></div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredVoiceModels.map((model) => (
                  <div
                    key={model.id}
                    className="p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 text-sm"
                  >
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
                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded">
                        {model.category}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1 my-1">
                      {model.labels.gender && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded">
                          {model.labels.gender}
                        </span>
                      )}
                      {model.labels.accent && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded">
                          {model.labels.accent}
                        </span>
                      )}
                    </div>

                    {model.previewUrl && (
                      <audio 
                        src={model.previewUrl} 
                        controls 
                        className="w-full h-6 mt-1"
                      />
                    )}

                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleVoiceSelection(model)}
                        className={`flex-1 px-2 py-1 text-xs rounded ${
                          selectedVoiceModel?.id === model.id
                            ? 'bg-green-500 text-white'
                            : 'bg-blue-500 text-white hover:bg-blue-600'
                        }`}
                      >
                        {selectedVoiceModel?.id === model.id ? 'Selected' : 'Select Voice'}
                      </button>
                      {selectedVoiceModel?.id === model.id && currentDialogue?.recordedAudioUrl && !currentDialogue?.ai_converted_voiceover_url && (
                        <button
                          onClick={handleProcessVoice}
                          disabled={isProcessingVoice}
                          className="flex-1 px-2 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isProcessingVoice ? 'Processing...' : 'Process Voice'}
                        </button>
                      )}
                      {selectedVoiceModel?.id === model.id && (
                        <button
                          onClick={handleBulkVoiceUpdate}
                          disabled={isProcessingBulkVoiceUpdate}
                          className="flex-1 px-2 py-1 text-xs bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
                        >
                          {isProcessingBulkVoiceUpdate ? 'Updating...' : 'Apply to All'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
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
                <div className="aspect-video bg-black">
                  <video
                    ref={videoRef}
                    src={currentDialogue?.videoUrl}
                    className="w-full h-full object-contain"
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
                          {isSyncedPlaying ? 'Stop Original' : 'Play Original'}
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
                {currentDialogue.recordedAudioUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Original:</span>
                      <audio 
                        controls 
                        src={currentDialogue.recordedAudioUrl} 
                        className="flex-1 h-8"
                      />
                    </div>
                    {currentDialogue.voiceId && (
                      <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/30 rounded">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">AI Voice:</span>
                        <audio 
                          controls 
                          src={currentDialogue.ai_converted_voiceover_url || `https://${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/converted_audio/${currentDialogue.dialogNumber}.wav`}
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