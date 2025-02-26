'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Search, Save, AlertCircle } from 'lucide-react';
import { Project } from '@/types/project';
import type { Episode as ProjectEpisode } from '@/types/project';
import { toast } from 'react-toastify';
import axios from 'axios';
import { useSession } from 'next-auth/react';

// Add type for translation data
interface TranslationData {
    dialogues: TranslationDialogue[];
}

interface TranslationDialogue {
    id: string;
    originalText: string;
    translatedText: string;
    adaptedText?: string;
    characterName: string;
    startTime: number;
    endTime: number;
    videoClipUrl?: string;
}

interface EpisodeSteps {
    audioExtraction: {
        status: 'pending' | 'processing' | 'completed' | 'error';
        extracted_speechPath?: string;
        extracted_speechKey?: string;
        extracted_musicPath?: string;
        extracted_musicKey?: string;
        updatedAt?: string | Date;
        error?: string;
    };
    transcription: {
        status: 'pending' | 'processing' | 'completed' | 'error';
        transcriptionData?: {
            dialogues: Array<{
                id: string;
                text: string;
                characterName: string;
                startTime: number;
                endTime: number;
                videoClipUrl?: string;
            }>;
        };
        updatedAt?: string | Date;
        error?: string;
    };
    translation: {
        status: 'pending' | 'processing' | 'completed' | 'error';
        translationData?: {
            dialogues: TranslationDialogue[];
        };
        updatedAt?: string | Date;
        error?: string;
    };
    videoClips: {
        status: 'pending' | 'processing' | 'completed' | 'error';
        clips?: Array<{
            id: string;
            path: string;
            key: string;
            startTime: number;
            endTime: number;
            dialogueId?: string;
        }>;
        updatedAt?: string | Date;
        error?: string;
    };
    voiceAssignment: {
        status: 'pending' | 'processing' | 'completed' | 'error';
        characterVoices?: Array<{
            characterName: string;
            voiceId: string;
            voiceProvider: string;
            settings?: {
                stability?: number;
                similarity_boost?: number;
                style?: number;
                use_speaker_boost?: boolean;
            };
        }>;
        voiceConversions?: Array<{
            dialogueId: string;
            audioPath?: string;
            audioKey?: string;
            status: 'pending' | 'processing' | 'completed' | 'error';
            error?: string;
        }>;
        updatedAt?: string | Date;
        error?: string;
    };
}

interface ExtendedEpisode extends Omit<ProjectEpisode, 'steps'> {
    steps: EpisodeSteps;
}

interface Dialogue {
    subtitelIndex: number;
    dialogNumber: string;
    id: string;
    characterName: string;
    text: string;
    translated: string;
    adapted: string;
    timeStart: number;
    timeEnd: number;
    videoClipUrl?: string;
    isModified?: boolean;
}

interface AdminTranslatorViewProps {
    project?: Project;
    episode?: ProjectEpisode;
    onBack?: () => void;
    dialogues?: Array<{
        subtitleIndex: number;
        dialogNumber: string;
        characterName: string;
        dialogue: {
            original: string;
            translated: string;
            adapted: string;
        };
        startTime: number;
        endTime: number;
        videoClipUrl?: string;
    }>;
}

// Update the adapter function to handle both input types
const adaptDialogue = (dialogue: TranslationDialogue | any, index: number): Dialogue => {
    // Handle the case where dialogue is from translation data
    if ('originalText' in dialogue) {
        return {
            id: dialogue.id || `dialogue-${index}`,
            subtitelIndex: index + 1,
            dialogNumber: `${index + 1}`,
            characterName: dialogue.characterName,
            text: dialogue.originalText,
            translated: dialogue.translatedText || '',
            adapted: dialogue.adaptedText || '',
            timeStart: dialogue.startTime,
            timeEnd: dialogue.endTime,
            videoClipUrl: dialogue.videoClipUrl
        };
    }

    // Handle the case where dialogue is already in the target format
    if ('id' in dialogue && 'text' in dialogue) {
        return {
            ...dialogue,
            id: dialogue.id || `dialogue-${index}`
        } as Dialogue;
    }

    // Handle the case where dialogue is in the source format
    return {
        id: dialogue.subtitleIndex?.toString() || `dialogue-${index}`,
        subtitelIndex: dialogue.subtitleIndex,
        dialogNumber: dialogue.dialogNumber,
        characterName: dialogue.characterName,
        text: dialogue.dialogue.original,
        translated: dialogue.dialogue.translated || '',
        adapted: dialogue.dialogue.adapted || '',
        timeStart: dialogue.timeStart || dialogue.startTime,
        timeEnd: dialogue.timeEnd || dialogue.endTime,
        videoClipUrl: dialogue.videoClipUrl
    };
};

// Add these new interfaces after the existing interfaces
interface KeyboardShortcuts {
    save: string[];
    nextRow: string[];
    prevRow: string[];
    playMedia: string[];
}

interface RowState {
    id: string;
    isEditing: boolean;
    focusField: 'translated' | 'adapted' | null;
}

export default function AdminTranslatorView({ project, episode, onBack, dialogues = [] }: AdminTranslatorViewProps) {
    // Add detailed logging of initial props
    console.log('AdminTranslatorView: Detailed props', {
        project: {
            id: project?._id,
            title: project?.title,
            databaseName: project?.databaseName
        },
        episode: {
            id: episode?._id,
            name: episode?.name,
            hasTranslationData: episode?.steps?.translation?.status === 'completed',
            dialoguesCount: episode?.steps?.translation?.translationData?.dialogues?.length || 0
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
    const [currentEpisode, setCurrentEpisode] = useState<ProjectEpisode | undefined>(undefined);
    
    // Remove pagination state
    const [modifiedDialogues, setModifiedDialogues] = useState<Record<string, Dialogue>>({});
    const [isUpdating, setIsUpdating] = useState(false);

    // Add these new state variables inside the component
    const [activeRow, setActiveRow] = useState<RowState | null>(null);
    const [showShortcutsModal, setShowShortcutsModal] = useState(false);
    const [autoPlayMedia, setAutoPlayMedia] = useState(false);

    // Add keyboard shortcuts configuration
    const keyboardShortcuts: KeyboardShortcuts = {
        save: ['ctrl+s', 'cmd+s'],
        nextRow: ['ctrl+down', 'cmd+down'],
        prevRow: ['ctrl+up', 'cmd+up'],
        playMedia: ['ctrl+space', 'cmd+space']
    };

    // Add keyboard event handler
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isCtrlOrCmd = e.ctrlKey || e.metaKey;
            
            if (isCtrlOrCmd && e.key === 's') {
                e.preventDefault();
                if (activeRow) {
                    handleDialogueUpdate(activeRow.id, {}, true);
                }
            } else if (isCtrlOrCmd && e.key === 'ArrowDown') {
                e.preventDefault();
                moveToNextRow();
            } else if (isCtrlOrCmd && e.key === 'ArrowUp') {
                e.preventDefault();
                moveToPreviousRow();
            } else if (isCtrlOrCmd && e.key === ' ') {
                e.preventDefault();
                toggleMediaPlayback();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeRow]);

    // Add navigation functions
    const moveToNextRow = () => {
        if (!activeRow) return;
        const currentIndex = filteredData.findIndex(d => d.id === activeRow.id);
        if (currentIndex < filteredData.length - 1) {
            setActiveRow({
                id: filteredData[currentIndex + 1].id,
                isEditing: true,
                focusField: activeRow.focusField
            });
        }
    };

    const moveToPreviousRow = () => {
        if (!activeRow) return;
        const currentIndex = filteredData.findIndex(d => d.id === activeRow.id);
        if (currentIndex > 0) {
            setActiveRow({
                id: filteredData[currentIndex - 1].id,
                isEditing: true,
                focusField: activeRow.focusField
            });
        }
    };

    const toggleMediaPlayback = () => {
        if (!activeRow) return;
        const dialogue = filteredData.find(d => d.id === activeRow.id);
        if (dialogue?.videoClipUrl) {
            let audio = (dialogue as any).audioElement;
            if (!audio) {
                audio = new Audio(dialogue.videoClipUrl);
                audio.onerror = (e: Event) => handleMediaError(e as any, 'audio');
                (dialogue as any).audioElement = audio;
            }
            
            if (audio.paused) {
                audio.play().catch((e: Error) => handleMediaError(e, 'audio'));
            } else {
                audio.pause();
            }
            setDialogues([...dialoguesList]);
        }
    };

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

    // Add a useCallback for initialization to prevent unnecessary re-renders
    const initializeData = useCallback(() => {
        try {
            // Set project data
            const projectData = project || JSON.parse(sessionStorage.getItem('currentProject') || 'null');
            console.log('AdminTranslatorView: Project data', {
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
            console.log('AdminTranslatorView: Episode data', {
                fromProps: Boolean(episode),
                fromSession: Boolean(sessionStorage.getItem('currentEpisode')),
                episodeData: {
                    id: episodeData?._id,
                    name: episodeData?.name,
                    translationStatus: episodeData?.steps?.translation?.status || 'pending',
                    hasTranslationData: episodeData?.steps?.translation?.status === 'completed',
                    dialoguesCount: episodeData?.steps?.translation?.translationData?.dialogues?.length || 0
                }
            });

            if (episodeData) {
                setCurrentEpisode(episodeData);
            }

            // Set initial dialogues with adapter
            if (dialogues.length > 0) {
                console.log('AdminTranslatorView: Setting dialogues from props', {
                    count: dialogues.length
                });
                setDialogues(dialogues.map((d, index) => adaptDialogue(d, index)));
            } else if (episodeData?.steps?.translation?.status === 'completed') {
                const translationData = episodeData.steps.translation.translationData;
                if (translationData?.dialogues) {
                    console.log('AdminTranslatorView: Setting dialogues from episode data', {
                        count: translationData.dialogues.length
                    });
                    setDialogues(translationData.dialogues.map((d: TranslationDialogue, index: number) => adaptDialogue(d, index)));
                }
            }

            setIsInitialized(true);
        } catch (error) {
            console.error('Error initializing data:', error);
            toast.error('Failed to initialize data');
        }
    }, [project, episode, dialogues]);

    // Update the initialization useEffect to prevent multiple initializations
    useEffect(() => {
        if (authStatus !== 'authenticated' || isInitialized) {
            console.log('AdminTranslatorView: Skipping initialization - not authenticated or already initialized');
            return;
        }

        console.log('AdminTranslatorView: Starting initialization');
        initializeData();
    }, [authStatus, isInitialized, initializeData]);

    // Update the dialogues update useEffect
    useEffect(() => {
        if (!isInitialized) {
            console.log('AdminTranslatorView: Skipping dialogue update - not initialized');
            return;
        }

        // Use translation-specific data structure
        const newDialoguesData = dialogues.length > 0 ? dialogues : 
            currentEpisode?.steps?.translation?.translationData?.dialogues;

        if (!newDialoguesData) {
            console.log('AdminTranslatorView: No dialogue data available');
            return;
        }

        console.log('AdminTranslatorView: Updating dialogues', {
            dataSource: dialogues.length > 0 ? 'props' : 'episode',
            dialogueCount: newDialoguesData.length
        });

        setDialogues(newDialoguesData.map((d: any, index: number) => adaptDialogue(d, index)));
    }, [isInitialized, dialogues, currentEpisode?.steps?.translation?.translationData?.dialogues]);

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

    // Add memoization for filtered data
    const filteredData = useMemo(() => {
        return dialoguesList.filter(dialogue => {
            const matchesSearch = (dialogue.characterName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                dialogue.text?.toLowerCase().includes(searchTerm.toLowerCase()));

            const matchesCharacter = !selectedCharacter || dialogue.characterName === selectedCharacter;

            const dialogueScene = dialogue.dialogNumber.split('.').slice(0, -1).join('.');
            const matchesScene = !selectedScene || dialogueScene === selectedScene;

            return matchesSearch && matchesCharacter && matchesScene;
        });
    }, [dialoguesList, searchTerm, selectedCharacter, selectedScene]);

    // Add error boundary for video/audio elements
    const handleMediaError = useCallback((error: Error, mediaType: 'video' | 'audio') => {
        console.error(`${mediaType} playback error:`, error);
        toast.error(`Failed to play ${mediaType}. Please try again.`);
    }, []);

    // Show loading state while initializing
    if (!isInitialized || authStatus !== 'authenticated') {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading Translator...</p>
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

            setDialogues(prev => prev.map(d => {
                if (d.id === dialogueId) {
                    const updatedDialogue = { ...d, ...updates, isModified: true };
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

            if (shouldSave && currentEpisode?._id && currentProject?._id) {
                await axios.post(`/api/episodes/${currentEpisode._id}/dialogues/${dialogueId}`, {
                    projectId: currentProject._id,
                    updates: {
                        translated: updates.translated,
                        adapted: updates.adapted
                    }
                });
                
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
                                    Translator View
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
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <button
                            onClick={() => setShowShortcutsModal(true)}
                            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white flex items-center space-x-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                            <span>Keyboard Shortcuts</span>
                        </button>
                        <div className="flex items-center space-x-4">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="autoPlayMedia"
                                    checked={autoPlayMedia}
                                    onChange={(e) => setAutoPlayMedia(e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <label htmlFor="autoPlayMedia" className="text-sm text-gray-600 dark:text-gray-300">
                                    Auto-play media on row focus
                                </label>
                            </div>
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
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Character
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Original
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Translated
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Adapted
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Time
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Media
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredData.map((dialogue, index) => (
                                    <tr
                                        key={dialogue.id || `row-${index}`}
                                        className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                                            dialogue.isModified ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                                        } ${activeRow?.id === dialogue.id ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''}`}
                                        onClick={() => {
                                            setActiveRow({
                                                id: dialogue.id,
                                                isEditing: true,
                                                focusField: null
                                            });
                                            if (autoPlayMedia && dialogue.videoClipUrl) {
                                                toggleMediaPlayback();
                                            }
                                        }}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {dialogue.subtitelIndex}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {dialogue.dialogNumber}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {dialogue.characterName}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-900 dark:text-white">
                                                {dialogue.text}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <textarea
                                                value={dialogue.translated}
                                                onChange={(e) => handleDialogueUpdate(dialogue.id, { translated: e.target.value })}
                                                onFocus={() => setActiveRow({
                                                    id: dialogue.id,
                                                    isEditing: true,
                                                    focusField: 'translated'
                                                })}
                                                rows={2}
                                                className={`w-full text-sm text-gray-900 dark:text-white bg-transparent border rounded-md transition-all ${
                                                    activeRow?.id === dialogue.id && activeRow.focusField === 'translated'
                                                        ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500 dark:ring-blue-400'
                                                        : 'border-gray-300 dark:border-gray-600'
                                                }`}
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <textarea
                                                value={dialogue.adapted}
                                                onChange={(e) => handleDialogueUpdate(dialogue.id, { adapted: e.target.value })}
                                                onFocus={() => setActiveRow({
                                                    id: dialogue.id,
                                                    isEditing: true,
                                                    focusField: 'adapted'
                                                })}
                                                rows={2}
                                                className={`w-full text-sm text-gray-900 dark:text-white bg-transparent border rounded-md transition-all ${
                                                    activeRow?.id === dialogue.id && activeRow.focusField === 'adapted'
                                                        ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500 dark:ring-blue-400'
                                                        : 'border-gray-300 dark:border-gray-600'
                                                }`}
                                            />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {dialogue.timeStart}s - {dialogue.timeEnd}s
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            <div className="flex items-center space-x-3">
                                                {dialogue.videoClipUrl && (
                                                    <>
                                                        {/* Audio control with error handling */}
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleMediaPlayback();
                                                            }}
                                                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                                            title="Play/Pause Audio"
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

                                                        {/* Video preview */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedDialogue(dialogue);
                                                            }}
                                                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                                            title="View Video Clip"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                                                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
                                                                <line x1="7" y1="2" x2="7" y2="22"/>
                                                                <line x1="17" y1="2" x2="17" y2="22"/>
                                                                <line x1="2" y1="12" x2="22" y2="12"/>
                                                                <line x1="2" y1="7" x2="7" y2="7"/>
                                                                <line x1="2" y1="17" x2="7" y2="17"/>
                                                                <line x1="17" y1="17" x2="22" y2="17"/>
                                                                <line x1="17" y1="7" x2="22" y2="7"/>
                                                            </svg>
                                                        </button>
                                                    </>
                                                )}

                                                {/* Save changes button */}
                                                {dialogue.isModified && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDialogueUpdate(dialogue.id, {
                                                                translated: dialogue.translated,
                                                                adapted: dialogue.adapted
                                                            }, true);
                                                        }}
                                                        disabled={isUpdating}
                                                        className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Save Changes"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                                            <polyline points="17 21 17 13 7 13 7 21"/>
                                                            <polyline points="7 3 7 8 15 8"/>
                                                        </svg>
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
                            onError={(e) => handleMediaError(e as any, 'video')}
                        />
                    </div>
                </div>
            )}

            {/* Keyboard Shortcuts Modal */}
            {showShortcutsModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                Keyboard Shortcuts
                            </h3>
                            <button
                                onClick={() => setShowShortcutsModal(false)}
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                                ×
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="text-sm text-gray-600 dark:text-gray-300">Save Changes</div>
                                <div className="text-sm font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                    Ctrl/Cmd + S
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-300">Next Row</div>
                                <div className="text-sm font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                    Ctrl/Cmd + ↓
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-300">Previous Row</div>
                                <div className="text-sm font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                    Ctrl/Cmd + ↑
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-300">Play/Pause Media</div>
                                <div className="text-sm font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                    Ctrl/Cmd + Space
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
} 