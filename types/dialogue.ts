import { ObjectId } from "mongoose";

export interface CharacterProfile {
  age?: string;
  gender?: string;
  occupation?: string;
  accents?: string[];
  otherNotes?: string;
}

export interface Word {
  wordSequenceNumber: string;
  word: string;
  wordStartTimestamp: string;
  wordEndTimestamp: string;
  numberOfLipMovementsForThisWord: number;
}

export interface WordDetail {
  characterName: string;
  wordSequenceNumber: number;
  word: string;
  wordTimestamp: string;
  dialogNumber: number;
  dialogStartTimestamp: string;
  dialogEndTimestamp: string;
  dialogVocalFile: string;
  characterProfile: CharacterProfile;
  numberOfLipMovementsForThisWord: number;
}

export interface DialogueText {
  original: string;
  translated: string;
  adapted: string;
}

export interface Emotions {
  primary: {
    emotion?: string;
    intensity?: number;
  };
  secondary?: {
    emotion?: string;
    intensity?: number;
  };
}

export interface Scenario {
  name?: string;
  description?: string;
  location?: string;
  timeOfDay?: string;
  otherScenarioNotes?: string;
}

export interface Dialogue {
  ai_converted_voiceover_url: string | undefined;
  voiceId: string | null | undefined;
  recordedAudioUrl: null;
  dialougeNumber: number;
  timeStart: string;
  timeEnd: string;
  subtitleIndex: number;
  videoClipUrl: string;
  characterName: string;
  dialogue: DialogueText;
  emotions: Emotions;
  characterProfile: CharacterProfile;
  tone?: string;
  lipMovements?: string;
  technicalNotes?: string;
  culturalNotes?: string;
  words: Word[];
  status?: string;
  voiceOverUrl?: string;
  voiceOverNotes?: string;
  directorNotes?: string;
  recordingStatus?: string;
  projectId?: string;
  updatedAt?: string;
  updatedBy?: string;
  _id?: ObjectId | string;
  scenario?: Scenario;
  deleteVoiceOver?: boolean;
}

export interface Scene {
  _id: string;
  sceneNumber: string;
  sceneDiscription: string;
  timeStart: string;
  timeEnd: string;
  dialogueCount: number;
  dialogues: Dialogue[];
}

export interface DialogueViewProps {
  dialogues: Dialogue[];
  projectId: string;
  episode?: {
    _id: string;
    name: string;
    status: string;
  };
  project?: {
    _id: string | ObjectId;
    title: string;
    sourceLanguage: string;
    targetLanguage: string;
    status: string;
  };
} 