'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Project, Episode } from '@/types/project';
import { Loader2, CheckCircle2, XCircle, AlertCircle, Play, Pause, RefreshCw, Mic, ChevronLeft, ChevronRight } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface DialogueText {
  original: string;
  translated: string;
  adapted: string;
}

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

interface AdminVoiceAssignmentDialogue {
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
  index: number;
  revisionRequested: boolean;
  needsReRecord: boolean;
}

interface CharacterGroupedDialogues {
  [character: string]: AdminVoiceAssignmentDialogue[];
}

interface AdminVoiceAssignmentViewProps {
  project: Project;
  episode: Episode;
  dialogues: AdminVoiceAssignmentDialogue[];
  onComplete?: () => void;
}

interface ConversionProgress {
  status: string;
  percent: number;
  timestamp: string;
}

interface ConversionStatus {
  [dialogueId: string]: ConversionProgress;
}

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

export default function AdminVoiceAssignmentView({ project, episode, dialogues: initialDialogues, onComplete }: AdminVoiceAssignmentViewProps) {
  const [dialogues, setDialogues] = useState<AdminVoiceAssignmentDialogue[]>(initialDialogues);
  const [voiceModels, setVoiceModels] = useState<VoiceModel[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [selectedVoiceModel, setSelectedVoiceModel] = useState<VoiceModel | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [conversionStatus, setConversionStatus] = useState<ConversionStatus>({});
  const [activeConversions, setActiveConversions] = useState<Set<string>>(new Set());
  const progressInterval = useRef<NodeJS.Timeout>();
  const [selectedGender, setSelectedGender] = useState<string>('all');
  const [characterSearchQuery, setCharacterSearchQuery] = useState('');
  const [dialogueFilter, setDialogueFilter] = useState('all');
  const [currentDialogueIndex, setCurrentDialogueIndex] = useState(0);

  // Group dialogues by character
  const characterDialogues = dialogues.reduce<CharacterGroupedDialogues>((acc, dialogue) => {
    if (!acc[dialogue.characterName]) {
      acc[dialogue.characterName] = [];
    }
    acc[dialogue.characterName].push(dialogue);
    return acc;
  }, {});

  // Filter voice models by gender
  const filteredVoiceModels = voiceModels.filter(model => {
    if (selectedGender === 'all') return true;
    return model.labels.gender?.toLowerCase() === selectedGender;
  });

  // Filter characters by search query
  const filteredCharacters = Object.entries(characterDialogues)
    .filter(([character]) => 
      character.toLowerCase().includes(characterSearchQuery.toLowerCase())
    );

  // Filter dialogues based on selected filter
  const filteredDialogues = selectedCharacter ? characterDialogues[selectedCharacter].filter(dialogue => {
    switch (dialogueFilter) {
      case 'pending':
        return dialogue.status === 'pending';
      case 'revision':
        return dialogue.revisionRequested;
      case 'rerecord':
        return dialogue.needsReRecord;
      default:
        return true;
    }
  }) : [];

  const currentDialogue = filteredDialogues[currentDialogueIndex];

  // Navigation handlers
  const handleNext = () => {
    if (currentDialogueIndex < filteredDialogues.length - 1) {
      setCurrentDialogueIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentDialogueIndex > 0) {
      setCurrentDialogueIndex(prev => prev - 1);
    }
  };

  // Fetch voice models
  const fetchVoiceModels = async () => {
    try {
      const response = await axios.get('/api/voice-models');
      setVoiceModels(response.data);
    } catch (error) {
      toast.error('Failed to fetch voice models');
      console.error('Error fetching voice models:', error);
    }
  };

  useEffect(() => {
    fetchVoiceModels();
  }, [episode._id]);

  // Update handleVoiceSelection to update local state after API call
  const handleVoiceSelection = async (model: VoiceModel) => {
    if (!selectedCharacter) {
      toast.error('Please select a character first');
      return;
    }

    setSelectedVoiceModel(model);
    setIsProcessing(true);

    try {
      // Update voice assignments for all dialogues of the selected character
      const dialoguesToUpdate = characterDialogues[selectedCharacter];
      await axios.post(`/api/episodes/${episode._id}/voice-assignments`, {
        characterName: selectedCharacter,
        voiceId: model.id,
        dialogueIds: dialoguesToUpdate.map(d => d._id)
      });

      // Update local state with new voice assignments
      setDialogues(prevDialogues => 
        prevDialogues.map(dialogue => 
          dialogue.characterName === selectedCharacter
            ? { ...dialogue, voiceId: model.id }
            : dialogue
        )
      );

      toast.success(`Voice assigned to ${selectedCharacter}`);
    } catch (error) {
      toast.error('Failed to assign voice');
      console.error('Error assigning voice:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Update useEffect to set dialogues when initialDialogues prop changes
  useEffect(() => {
    setDialogues(initialDialogues);
  }, [initialDialogues]);

  // Handle audio preview
  const handlePreview = async (voiceModel: VoiceModel, text: string) => {
    try {
      setIsLoading(true);
      const response = await axios.post('/api/voice-models/preview', {
        voiceId: voiceModel.id,
        text
      });

      if (audioRef.current) {
        audioRef.current.src = response.data.audioUrl;
        audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      toast.error('Failed to generate preview');
      console.error('Error generating preview:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle audio playback
  const togglePlayback = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Handle voice conversion
  const handleVoiceConversion = async (dialogue: AdminVoiceAssignmentDialogue) => {
    if (!dialogue.recordedAudioUrl || !dialogue.voiceId) {
      toast.error('Missing audio or voice selection');
      return;
    }

    try {
      setActiveConversions(prev => new Set(prev).add(dialogue._id));

      const response = await axios.post('/api/voice-models/speech-to-speech', {
        voiceId: dialogue.voiceId,
        recordedAudioUrl: dialogue.recordedAudioUrl,
        dialogueNumber: dialogue.dialogNumber,
        characterName: dialogue.characterName
      });

      if (response.data.success) {
        // Update dialogue with new audio URL
        await axios.post(`/api/episodes/${episode._id}/voice-assignments`, {
          dialogueIds: [dialogue._id],
          voiceId: dialogue.voiceId,
          characterName: dialogue.characterName,
          ai_converted_voiceover_url: response.data.audioUrl
        });

        toast.success('Voice conversion completed');
        await fetchVoiceModels(); // Refresh dialogues
      }
    } catch (error: any) {
      toast.error(error.response?.data?.details || 'Failed to convert voice');
      console.error('Error in voice conversion:', error);
    } finally {
      setActiveConversions(prev => {
        const next = new Set(prev);
        next.delete(dialogue._id);
        return next;
      });
    }
  };

  // Track conversion progress
  const checkConversionProgress = useCallback(async () => {
    if (activeConversions.size === 0) return;

    try {
      const promises = Array.from(activeConversions).map(async (dialogueId) => {
        const response = await axios.get(`/api/progress/${dialogueId}`);
        return { dialogueId, progress: response.data };
      });

      const results = await Promise.all(promises);
      const newStatus: ConversionStatus = {};
      
      results.forEach(({ dialogueId, progress }) => {
        newStatus[dialogueId] = progress;
        
        // Remove completed or failed conversions from active set
        if (progress.percent === 100 || progress.percent === -1) {
          setActiveConversions(prev => {
            const next = new Set(prev);
            next.delete(dialogueId);
            return next;
          });
        }
      });

      setConversionStatus(prev => ({ ...prev, ...newStatus }));
    } catch (error) {
      console.error('Error checking conversion progress:', error);
    }
  }, [activeConversions]);

  // Set up progress tracking interval
  useEffect(() => {
    if (activeConversions.size > 0 && !progressInterval.current) {
      progressInterval.current = setInterval(checkConversionProgress, 2000);
    } else if (activeConversions.size === 0 && progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = undefined;
    }

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [activeConversions, checkConversionProgress]);

  // Render conversion progress
  const renderConversionProgress = (dialogue: AdminVoiceAssignmentDialogue) => {
    const progress = conversionStatus[dialogue._id];
    const isActive = activeConversions.has(dialogue._id);

    if (!isActive && !progress) return null;

    return (
      <div className="mt-2">
        {progress ? (
          <div className="flex items-center space-x-2">
            {progress.percent === 100 ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : progress.percent === -1 ? (
              <XCircle className="w-4 h-4 text-red-500" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            )}
            <span className="text-sm">
              {progress.status} {progress.percent > 0 && progress.percent < 100 ? `(${progress.percent}%)` : ''}
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span className="text-sm">Initializing conversion...</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left Sidebar - 1/4 width */}
      <div className="w-1/4 flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        {/* Characters Section - Top Half */}
        <div className="h-1/2 border-b border-gray-200 dark:border-gray-700">
          <div className="h-full flex flex-col">
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex-none">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">Characters</h3>
                {selectedCharacter && (
                  <button
                    onClick={() => setSelectedCharacter('')}
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
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="space-y-1">
                {filteredCharacters.map(([character, dialogues]) => {
                  const dialoguesWithVoice = dialogues.filter(d => d.voiceId);
                  const voiceAssignmentPercentage = Math.round((dialoguesWithVoice.length / dialogues.length) * 100);
                  
                  return (
                    <button
                      key={character}
                      onClick={() => setSelectedCharacter(character)}
                      className={`w-full px-3 py-2 rounded text-left text-sm ${
                        selectedCharacter === character
                          ? 'bg-blue-500 text-white'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span>{character}</span>
                        <span className="text-xs">{voiceAssignmentPercentage}%</span>
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
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">Voice Models</h3>
                <select
                  value={selectedGender}
                  onChange={(e) => setSelectedGender(e.target.value)}
                  className="text-xs border border-gray-300 rounded bg-white dark:bg-gray-700 px-2 py-1"
                >
                  <option value="all">All</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="space-y-2">
                {filteredVoiceModels.map((model) => (
                  <div
                    key={model.id}
                    className={`p-2 rounded-lg border ${
                      selectedVoiceModel?.id === model.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex-1">
                        <div className="font-medium flex items-center gap-1">
                          {model.name}
                          {model.verification.verified && (
                            <span className="text-[10px] px-1 bg-green-100 text-green-800 rounded">✓</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {model.description}
                        </div>
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
                    <div className="flex justify-between items-center mt-2">
                      <button
                        onClick={() => handleVoiceSelection(model)}
                        disabled={isProcessing || !selectedCharacter}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Assign Voice'
                        )}
                      </button>
                      <button
                        onClick={() => handlePreview(model, currentDialogue?.dialogue.translated || '')}
                        disabled={isLoading}
                        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : isPlaying ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - 3/4 width */}
      <div className="w-3/4 overflow-y-auto">
        {!selectedCharacter ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Select a Character
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Choose a character from the list to start assigning voices
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
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={currentDialogueIndex === (filteredDialogues.length - 1)}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Dialogue Content */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Original
                  </label>
                  <div className="text-sm p-2 rounded bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                    {currentDialogue.dialogue.original}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Translated
                  </label>
                  <div className="text-sm p-2 rounded bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                    {currentDialogue.dialogue.translated}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Adapted
                  </label>
                  <div className="text-sm p-2 rounded bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                    {currentDialogue.dialogue.adapted}
                  </div>
                </div>
              </div>

              {/* Voice Conversion Section */}
              {currentDialogue.recordedAudioUrl && currentDialogue.voiceId && (
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                      Voice Conversion
                    </h4>
                    <button
                      onClick={() => handleVoiceConversion(currentDialogue)}
                      disabled={activeConversions.has(currentDialogue._id)}
                      className="flex items-center space-x-2 px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      <Mic className="w-4 h-4" />
                      <span>Convert Voice</span>
                    </button>
                  </div>
                  {renderConversionProgress(currentDialogue)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Audio Player */}
      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
    </div>
  );
} 