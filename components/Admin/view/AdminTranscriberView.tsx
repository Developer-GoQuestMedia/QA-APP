'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search, Save, AlertCircle } from 'lucide-react';
import { Project, Episode } from '@/types/project';
import { toast } from 'react-toastify';
import axios from 'axios';
import { useSession } from 'next-auth/react';

interface Dialogue {
    subtitelIndex: number;
    dialogNumber: string;
    id: string;
    characterName: string;
    text: string;
    timeStart: number;
    timeEnd: number;
    videoClipUrl?: string;
    isModified?: boolean;
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
        id: dialogue.subtitleIndex,
        subtitelIndex: dialogue.subtitleIndex,
        dialogNumber: dialogue.dialogNumber,
        characterName: dialogue.characterName,
        text: dialogue.dialogue.original,
        timeStart: dialogue.timeStart,
        timeEnd: dialogue.timeEnd,
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
        propsDialoguesCount: dialogues.length,
        dialogues: dialogues
    });

    const router = useRouter();
    const { status: authStatus } = useSession();
    const [isInitialized, setIsInitialized] = useState(false);
    const [dialoguesList, setDialogues] = useState<Dialogue[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCharacter, setSelectedCharacter] = useState<string>('');
    const [selectedScene, setSelectedScene] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [selectedDialogue, setSelectedDialogue] = useState<Dialogue | null>(null);
    const [currentProject, setCurrentProject] = useState<Project | undefined>(undefined);
    const [currentEpisode, setCurrentEpisode] = useState<Episode | undefined>(undefined);
    
    // Remove pagination state
    const [modifiedDialogues, setModifiedDialogues] = useState<Record<string, Dialogue>>({});
    const [isUpdating, setIsUpdating] = useState(false);

    // Add handleBack function
    const handleBack = () => {
        if (onBack) {
            onBack();
            return;
        }

        // Fallback navigation if onBack is not provided
        if (project?._id) {
            const backUrl = `/admin/project/${project._id}/episodes/${encodeURIComponent(episode?.name || '')}` as const;
            console.debug('Navigating back to:', backUrl);
            router.push(backUrl);
            return;
        }

        // If no project ID, try to get from sessionStorage
        try {
            const storedProject = sessionStorage.getItem('currentProject');
            if (storedProject) {
                const parsedProject = JSON.parse(storedProject);
                if (parsedProject._id) {
                    const backUrl = `/admin/project/${parsedProject._id}/episodes/${encodeURIComponent(episode?.name || '')}` as const;
                    console.debug('Navigating back to (from session):', backUrl);
                    router.push(backUrl);
                    return;
                }
            }
        } catch (error) {
            console.error('Error reading from sessionStorage:', error);
        }

        // Final fallback - just go to admin page
        console.debug('Fallback navigation to admin page');
        const adminPath = '/allDashboards/admin' as const;
        router.push(adminPath);
    };

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

    // Get unique character names and scene numbers
    const uniqueCharacters = useMemo(() => {
        const characters = new Set(dialoguesList.map(d => d.characterName));
        return Array.from(characters).filter(Boolean).sort();
    }, [dialoguesList]);

    const uniqueScenes = useMemo(() => {
        const scenes = new Set(dialoguesList.map(d => {
            const parts = d.dialogNumber.split('.');
            return parts.slice(0, -1).join('.');
        }));
        return Array.from(scenes).filter(Boolean).sort((a, b) => {
            const partsA = a.split('.').map(Number);
            const partsB = b.split('.').map(Number);
            for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                if (partsA[i] !== partsB[i]) {
                    return (partsA[i] || 0) - (partsB[i] || 0);
                }
            }
            return 0;
        });
    }, [dialoguesList]);

    // Filter dialogues without pagination
    const filteredData = useMemo(() => {
        return dialoguesList.filter(dialogue => {
            const matchesSearch = dialogue.characterName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                dialogue.text?.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesCharacter = !selectedCharacter || dialogue.characterName === selectedCharacter;

            const dialogueScene = dialogue.dialogNumber.split('.').slice(0, -1).join('.');
            const matchesScene = !selectedScene || dialogueScene === selectedScene;

            return matchesSearch && matchesCharacter && matchesScene;
        });
    }, [dialoguesList, searchTerm, selectedCharacter, selectedScene]);

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

    // Add function to handle individual dialogue update
    const handleDialogueUpdate = async (dialogueId: string, updates: Partial<Dialogue>, shouldSave: boolean = false) => {
        try {
            if (shouldSave) {
                setIsUpdating(true);
            }

            // Update local state
            setDialogues(prev => prev.map(d => {
                if (d.id === dialogueId) {
                    const updatedDialogue = { ...d, ...updates, isModified: true };
                    // Store in modified dialogues if not immediately saving
                    if (!shouldSave) {
                        setModifiedDialogues(prev => ({
                            ...prev,
                            [dialogueId]: updatedDialogue
                        }));
                    }
                    return updatedDialogue;
                }
                return d;
            }));

            // Update database if shouldSave is true
            if (shouldSave && currentEpisode?._id && currentProject?._id) {
                await axios.post(`/api/episodes/${currentEpisode._id}/dialogues/${dialogueId}`, {
                    projectId: currentProject._id,
                    updates
                });
                
                // Remove from modified dialogues after successful save
                setModifiedDialogues(prev => {
                    const newState = { ...prev };
                    delete newState[dialogueId];
                    return newState;
                });
                
                toast.success('Dialogue updated successfully');
            }
        } catch (error) {
            console.error('Update error:', error);
            toast.error('Failed to update dialogue');
        } finally {
            if (shouldSave) {
                setIsUpdating(false);
            }
        }
    };

    // Add function to update all modified dialogues
    const handleUpdateAllModified = async () => {
        setIsUpdating(true);
        try {
            if (!currentEpisode?._id || !currentProject?._id) {
                throw new Error('Missing episode or project ID');
            }

            const modifiedIds = Object.keys(modifiedDialogues);
            if (modifiedIds.length === 0) {
                toast.info('No modifications to save');
                return;
            }

            // Update all modified dialogues
            await Promise.all(
                modifiedIds.map(dialogueId => 
                    axios.post(`/api/episodes/${currentEpisode._id}/dialogues/${dialogueId}`, {
                        projectId: currentProject._id,
                        updates: {
                            characterName: modifiedDialogues[dialogueId].characterName,
                            text: modifiedDialogues[dialogueId].text
                        }
                    })
                )
            );

            // Clear modified state
            setModifiedDialogues({});
            toast.success(`Successfully updated ${modifiedIds.length} dialogues`);
        } catch (error) {
            console.error('Bulk update error:', error);
            toast.error('Failed to update some dialogues');
        } finally {
            setIsUpdating(false);
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
                                onClick={handleBack}
                                className="mr-4 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                aria-label="Go back"
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

                {/* Search and Filter Bar */}
                <div className="mb-6 space-y-4">
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

                    <div className="flex gap-4">
                        <div className="w-1/2">
                            <select
                                value={selectedCharacter}
                                onChange={(e) => setSelectedCharacter(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                            >
                                <option value="">All Characters</option>
                                {uniqueCharacters.map((character) => (
                                    <option key={character} value={character}>
                                        {character}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="w-1/2">
                            <select
                                value={selectedScene}
                                onChange={(e) => setSelectedScene(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                            >
                                <option value="">All Scenes</option>
                                {uniqueScenes.map((scene) => (
                                    <option key={scene} value={scene}>
                                        Scene {scene}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Dialogues Table */}
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                    {/* Table Header */}
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-end">
                        <div className="flex items-center space-x-4">
                            {Object.keys(modifiedDialogues).length > 0 && (
                                <button
                                    onClick={handleUpdateAllModified}
                                    disabled={isUpdating}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                                >
                                    {isUpdating ? (
                                        <>
                                            <Save className="w-4 h-4 animate-spin" />
                                            <span>Updating...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4" />
                                            <span>Update All Modified ({Object.keys(modifiedDialogues).length})</span>
                                        </>
                                    )}
                                </button>
                            )}
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                                Total entries: {filteredData.length}
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        #
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Dialogue Number
                                    </th>
                                    <th className="px-6 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Character
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Dialogue
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Time-Start
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Time-End
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        play-Audio
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredData.map((dialogue, index) => (
                                    <tr
                                        key={dialogue.id}
                                        className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                                            dialogue.isModified ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                                        }`}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {dialogue.subtitelIndex}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {dialogue.dialogNumber}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <input
                                                type="text"
                                                value={dialogue.characterName}
                                                onChange={(e) => handleDialogueUpdate(dialogue.id, { characterName: e.target.value }, true)}
                                                className="text-sm text-gray-900 dark:text-white bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none"
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <textarea
                                                value={dialogue.text}
                                                onChange={(e) => handleDialogueUpdate(dialogue.id, { text: e.target.value }, true)}
                                                rows={2}
                                                className="w-full text-sm text-gray-900 dark:text-white bg-transparent border rounded-md border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400"
                                            />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {dialogue.timeStart}ss
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {dialogue.timeEnd}ss
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {dialogue.videoClipUrl && (
                                                <button 
                                                    onClick={() => {
                                                        // Create audio element if it doesn't exist or get existing one
                                                        let audio = (dialogue as any).audioElement;
                                                        if (!audio) {
                                                            audio = new Audio(dialogue.videoClipUrl);
                                                            (dialogue as any).audioElement = audio;
                                                        }
                                                        
                                                        if (audio.paused) {
                                                            audio.play();
                                                        } else {
                                                            audio.pause();
                                                        }
                                                        // Force re-render to update play/pause icon
                                                        setDialogues([...dialoguesList]);
                                                    }}
                                                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                                >
                                                    {((dialogue as any).audioElement?.paused ?? true) ? (
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                                            <polygon points="5 3 19 12 5 21 5 3"/>
                                                        </svg>
                                                    ) : (
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                                            <rect x="6" y="4" width="4" height="16"/>
                                                            <rect x="14" y="4" width="4" height="16"/>
                                                        </svg>
                                                    )}
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            <div className="flex items-center space-x-2">
                                                {dialogue.videoClipUrl && (
                                                    <button
                                                        onClick={() => setSelectedDialogue(dialogue)}
                                                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                                    >
                                                        View Clip
                                                    </button>
                                                )}
                                                {dialogue.isModified && (
                                                    <button
                                                        onClick={() => handleDialogueUpdate(dialogue.id, {
                                                            characterName: dialogue.characterName,
                                                            text: dialogue.text
                                                        }, true)}
                                                        disabled={isUpdating}
                                                        className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isUpdating ? 'Updating...' : 'Save Changes'}
                                                    </button>
                                                )}
                                            </div>
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