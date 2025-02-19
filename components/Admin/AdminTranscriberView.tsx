'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search, Save, AlertCircle } from 'lucide-react';
import { Project, Episode } from '@/types/project';
import { toast } from 'react-toastify';
import axios from 'axios';
import { useSession } from 'next-auth/react';

interface Dialogue {
  id: string;
  characterName: string;
  text: string;
  startTime: number;
  endTime: number;
  videoClipUrl?: string;
}

interface AdminTranscriberViewProps {
  project?: Project;
  episode?: Episode;
  onBack?: () => void;
  dialogues?: Array<{
    subtitleIndex: number;
    dialogNumber: string;
    characterName: string;
    dialogue: {
      original: string;
    };
    startTime: number;
    endTime: number;
    videoClipUrl?: string;
  }>;
}

// Add adapter function to convert incoming dialogues to Dialogue format
const adaptDialogue = (dialogue: any): Dialogue => {
  // Handle the case where dialogue is already in the target format
  if ('id' in dialogue && 'text' in dialogue) {
    return dialogue as Dialogue;
  }
  
  // Handle the case where dialogue is in the source format
  return {
    id: dialogue.dialogNumber,
    characterName: dialogue.characterName,
    text: dialogue.dialogue.original,
    startTime: dialogue.startTime,
    endTime: dialogue.endTime,
    videoClipUrl: dialogue.videoClipUrl
  };
};

export default function AdminTranscriberView({ project, episode, onBack, dialogues = [] }: AdminTranscriberViewProps) {
    // Add detailed logging of initial props
    console.log('AdminTranscriberView: Detailed props', {
        project: {
            id: project?._id,
            title: project?.title,
            databaseName: project?.databaseName
        },
        episode: {
            id: episode?._id,
            name: episode?.name,
            hasTranscriptionData: !!episode?.steps?.transcription?.transcriptionData,
            dialoguesCount: episode?.steps?.transcription?.transcriptionData?.dialogues?.length
        },
        propsDialoguesCount: dialogues.length
    });

    const router = useRouter();
    const { status: authStatus } = useSession();
    const [isInitialized, setIsInitialized] = useState(false);
    const [dialoguesList, setDialogues] = useState<Dialogue[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [selectedDialogue, setSelectedDialogue] = useState<Dialogue | null>(null);
    const [currentProject, setCurrentProject] = useState<Project | undefined>(undefined);
    const [currentEpisode, setCurrentEpisode] = useState<Episode | undefined>(undefined);

    // Initialize data only after authentication
    useEffect(() => {
        if (authStatus !== 'authenticated') {
            console.log('AdminTranscriberView: Waiting for authentication...');
            return;
        }

        const initializeData = () => {
            try {
                // Set project data
                const projectData = project || JSON.parse(sessionStorage.getItem('currentProject') || 'null');
                console.log('AdminTranscriberView: Project data', {
                    fromProps: !!project,
                    fromSession: !!sessionStorage.getItem('currentProject'),
                    projectData: {
                        id: projectData?._id,
                        title: projectData?.title
                    }
                });

                if (projectData) {
                    setCurrentProject(projectData);
                }

                // Set episode data
                const episodeData = episode || JSON.parse(sessionStorage.getItem('currentEpisode') || 'null');
                console.log('AdminTranscriberView: Episode data', {
                    fromProps: !!episode,
                    fromSession: !!sessionStorage.getItem('currentEpisode'),
                    episodeData: {
                        id: episodeData?._id,
                        name: episodeData?.name,
                        hasTranscriptionData: !!episodeData?.steps?.transcription?.transcriptionData,
                        dialoguesCount: episodeData?.steps?.transcription?.transcriptionData?.dialogues?.length
                    }
                });

                if (episodeData) {
                    setCurrentEpisode(episodeData);
                }

                // Set initial dialogues with adapter
                if (dialogues.length > 0) {
                    console.log('AdminTranscriberView: Setting dialogues from props', {
                        count: dialogues.length
                    });
                    setDialogues(dialogues.map(adaptDialogue));
                } else if (episodeData?.steps?.transcription?.transcriptionData?.dialogues) {
                    console.log('AdminTranscriberView: Setting dialogues from episode data', {
                        count: episodeData.steps.transcription.transcriptionData.dialogues.length
                    });
                    setDialogues(episodeData.steps.transcription.transcriptionData.dialogues.map(adaptDialogue));
                } else {
                    console.log('AdminTranscriberView: No dialogues available from either source');
                }

                setIsInitialized(true);
            } catch (error) {
                console.error('Error initializing data:', error);
                toast.error('Failed to initialize data');
            }
        };

        initializeData();
    }, [authStatus, project, episode, dialogues]);

    // Update dialogues when transcription data changes
    useEffect(() => {
        if (!isInitialized) {
            console.log('AdminTranscriberView: Skipping dialogue update - not initialized');
            return;
        }

        const updateDialogues = () => {
            console.log('AdminTranscriberView: Updating dialogues', {
                propsDialoguesCount: dialogues.length,
                episodeDialoguesCount: currentEpisode?.steps?.transcription?.transcriptionData?.dialogues?.length
            });

            if (dialogues.length > 0) {
                setDialogues(dialogues.map(adaptDialogue));
            } else if (currentEpisode?.steps?.transcription?.transcriptionData?.dialogues) {
                setDialogues(currentEpisode.steps.transcription.transcriptionData.dialogues.map(adaptDialogue));
            }
        };

        updateDialogues();
    }, [isInitialized, dialogues, currentEpisode?.steps?.transcription?.transcriptionData?.dialogues]);

    // Filter dialogues
    const filteredDialogues = useMemo(() => 
      dialoguesList.filter(dialogue =>
        dialogue.characterName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dialogue.text?.toLowerCase().includes(searchTerm.toLowerCase())
      ),
      [dialoguesList, searchTerm]
    );

    // Show loading state while initializing
    if (!isInitialized || authStatus !== 'authenticated') {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading transcriber...</p>
          </div>
        </div>
      );
    }

    // Handle dialogue update
    const handleDialogueUpdate = async (dialogueId: string, updates: Partial<Dialogue>) => {
      try {
        setIsSaving(true);
        
        // Update local state
        setDialogues(prev => prev.map(d => d.id === dialogueId ? { ...d, ...updates } : d));

        // Update database if we have required IDs
        if (currentEpisode?._id && currentProject?._id) {
          await axios.post(`/api/episodes/${currentEpisode._id}/dialogues/${dialogueId}`, {
            projectId: currentProject._id,
            updates
          });
          toast.success('Saved');
        }
      } catch (error) {
        console.error('Save error:', error);
        toast.error('Save failed');
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <button
                  onClick={onBack}
                  className="mr-4 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Transcriber View
                  </h1>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {currentProject?.title} - {currentEpisode?.name}
                  </p>
                </div>
              </div>
              
              {isSaving && (
                <div className="flex items-center text-blue-600 dark:text-blue-400">
                  <Save className="w-5 h-5 animate-spin mr-2" />
                  Saving...
                </div>
              )}
            </div>
          </div>

          {/* Search Bar */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search dialogues..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              />
            </div>
          </div>

          {/* Dialogues Table */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Character
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Dialogue
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredDialogues.map((dialogue, index) => (
                    <tr 
                      key={dialogue.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="text"
                          value={dialogue.characterName}
                          onChange={(e) => handleDialogueUpdate(dialogue.id, { characterName: e.target.value })}
                          className="text-sm text-gray-900 dark:text-white bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <textarea
                          value={dialogue.text}
                          onChange={(e) => handleDialogueUpdate(dialogue.id, { text: e.target.value })}
                          rows={2}
                          className="w-full text-sm text-gray-900 dark:text-white bg-transparent border rounded-md border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {dialogue.startTime}s - {dialogue.endTime}s
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {dialogue.videoClipUrl && (
                          <button
                            onClick={() => setSelectedDialogue(dialogue)}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                          >
                            View Clip
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Video Preview Modal */}
        {selectedDialogue && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Video Clip Preview
                </h3>
                <button
                  onClick={() => setSelectedDialogue(null)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ×
                </button>
              </div>
              <video
                src={selectedDialogue.videoClipUrl}
                controls
                className="w-full rounded-lg"
              />
            </div>
          </div>
        )}
      </div>
    );
} 