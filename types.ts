export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'neutral' | 'truth' | 'deception' | 'system';
}

export enum SessionStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  ACTIVE = 'ACTIVE',
  ERROR = 'ERROR'
}

export interface BiometricData {
  heartRate: number;
  stressLevel: number;
  pupilDilation: number;
}
