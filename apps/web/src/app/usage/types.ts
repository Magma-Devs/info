export interface BlockchainIncident {
  provider: string;
  date: string;
  timestamp: string;
  impact: string;
  chain: string;
  name: string;
}

export interface CloudIncident {
  provider: string;
  name: string;
  date: string;
  timestamp: string;
  impact: string;
  status?: string;
  description?: string;
}

export interface BlockchainIncidentsFile {
  summary?: { by_impact?: Record<string, number>; total_incidents?: number };
  incidents: BlockchainIncident[];
}

export interface CloudIncidentsFile {
  generated_at?: string;
  total_incidents?: number;
  providers?: Record<string, number>;
  incidents: CloudIncident[];
}
