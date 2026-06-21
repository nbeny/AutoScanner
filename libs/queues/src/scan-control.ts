export const SCAN_CONTROL_CHANNEL = 'scan-control';

export interface ScanControlMessage {
  type: 'CANCEL';
  scanJobId: string;
}
