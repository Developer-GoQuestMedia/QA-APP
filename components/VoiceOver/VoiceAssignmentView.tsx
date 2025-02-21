'use client';

import { useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { toast } from 'react-hot-toast';

interface VoiceModel {
  voice_id: string;
  name: string;
  preview_url: string;
  labels: {
    accent?: string;
    description?: string;
    age?: string;
    gender?: string;
    use_case?: string;
  };
}

interface CharacterDialogues {
  characterName: string;
  dialogueCount: number;
  voiceId?: string;
  sampleDialogue?: string;
}

interface VoiceAssignmentViewProps {
  episodeId: string;
  characters: CharacterDialogues[];
  onAssignmentComplete: (assignments: Array<{ characterName: string; voiceId: string }>) => void;
}

export default function VoiceAssignmentView({ episodeId, characters, onAssignmentComplete }: VoiceAssignmentViewProps) {
  const [voiceModels, setVoiceModels] = useState<VoiceModel[]>([]);
  const [assignments, setAssignments] = useState<Map<string, string>>(new Map());
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchVoiceModels();
  }, []);

  const fetchVoiceModels = async () => {
    try {
      const response = await fetch('/api/voice-models');
      const data = await response.json();
      setVoiceModels(data);
      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching voice models:', error);
      toast.error('Failed to load voice models');
      setIsLoading(false);
    }
  };

  const handleVoiceAssignment = (characterName: string, voiceId: string) => {
    const newAssignments = new Map(assignments);
    newAssignments.set(characterName, voiceId);
    setAssignments(newAssignments);
  };

  const handlePreview = (previewUrl: string) => {
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.remove();
    }

    const audio = new Audio(previewUrl);
    setPreviewAudio(audio);
    audio.play();
    setIsPreviewPlaying(true);
    
    audio.onended = () => {
      setIsPreviewPlaying(false);
    };
  };

  const handleSave = async () => {
    if (assignments.size !== characters.length) {
      toast.error('Please assign voices to all characters');
      return;
    }

    const assignmentArray = Array.from(assignments.entries()).map(([characterName, voiceId]) => ({
      characterName,
      voiceId
    }));

    try {
      const response = await fetch(`/api/episodes/${episodeId}/voice-assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assignments: assignmentArray }),
      });

      if (!response.ok) throw new Error('Failed to save voice assignments');

      toast.success('Voice assignments saved successfully');
      onAssignmentComplete(assignmentArray);
    } catch (error) {
      console.error('Error saving voice assignments:', error);
      toast.error('Failed to save voice assignments');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-6">Voice Assignment</h2>
      
      <div className="space-y-6">
        {characters.map((character) => (
          <div key={character.characterName} className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium">{character.characterName}</h3>
                <p className="text-sm text-gray-500">
                  {character.dialogueCount} dialogues
                </p>
              </div>
              <select
                value={assignments.get(character.characterName) || ''}
                onChange={(e) => handleVoiceAssignment(character.characterName, e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2"
              >
                <option value="">Select a voice</option>
                {voiceModels.map((voice) => (
                  <option key={voice.voice_id} value={voice.voice_id}>
                    {voice.name} ({voice.labels.gender}, {voice.labels.accent})
                  </option>
                ))}
              </select>
            </div>

            {assignments.get(character.characterName) && (
              <div className="mt-2">
                <button
                  onClick={() => {
                    const voice = voiceModels.find(v => v.voice_id === assignments.get(character.characterName));
                    if (voice) handlePreview(voice.preview_url);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {isPreviewPlaying ? 'Playing...' : 'Preview Voice'}
                </button>
              </div>
            )}

            {character.sampleDialogue && (
              <p className="text-sm text-gray-600 mt-2">
                Sample: &quot;{character.sampleDialogue}&quot;
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          Save Assignments
        </button>
      </div>
    </div>
  );
} 