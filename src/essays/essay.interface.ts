export enum EssayStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  CORRECTED = 'corrected',
}

export interface Essay {
  id: string;
  roomId: string;
  studentId: string;
  text: string;
  status: EssayStatus;
  score?: number;
}
