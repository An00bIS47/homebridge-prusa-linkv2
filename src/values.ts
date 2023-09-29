export class Paths {
  static readonly Http = 'http://';
  static readonly StatusPath = '/api/v1/status';
  static readonly JobPath = '/api/v1/job';
}

export enum PrinterStates {
  OPERATIONAL = 'Operational',
  PRINTING = 'Printing',
  PAUSED = 'Paused',
  IDLE = 'Idle',
  OFFLINE = 'Offline' // Custom state
}