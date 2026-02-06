import type { Adjuster, Interaction, Claim, InsertAdjuster, InsertClaim, Document, Attachment, InsertAttachment } from '@shared/schema';

export type AdjusterWithRelations = Adjuster & {
  claims: Claim[];
  interactions: Interaction[];
  documents: Document[];
};

export type AdjusterIntelligence = {
  totalInteractions: number;
  totalClaims: number;
  escalationCount: number;
  reinspectionCount: number;
  avgDaysToResolution: number | null;
  outcomesResolved: number;
  outcomesStalled: number;
  outcomesOpen: number;
  patternTags: string[];
  riskScore: number;
  responsivenessScore: number | null;
  cooperationLevel: 'Low' | 'Moderate' | 'High' | null;
  supplementApprovalRate: number | null;
  avgInteractionsPerClaim: number | null;
};

export type CarrierIntelligence = {
  carrier: string;
  totalAdjusters: number;
  totalClaims: number;
  avgInteractionsPerClaim: number | null;
  avgDaysToResolution: number | null;
  escalationEffectiveness: number | null;
  outcomesResolved: number;
  outcomesStalled: number;
  outcomesOpen: number;
  frictionLevel: 'Low' | 'Normal' | 'High' | null;
  resolutionTendency: 'Fast' | 'Normal' | 'Slow' | null;
  riskScore: number | null;
  supplementSuccessRate: number | null;
  reinspectionWinRate: number | null;
};

export type ClaimWithRelations = Claim & {
  adjusters: Adjuster[];
  interactions: Interaction[];
};

export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('session_token') || sessionStorage.getItem('session_token');
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}

export async function fetchAdjusters(): Promise<Adjuster[]> {
  const response = await authFetch('/api/adjusters');
  if (!response.ok) {
    throw new Error('Failed to fetch adjusters');
  }
  return response.json();
}

export async function fetchAdjuster(id: string): Promise<AdjusterWithRelations> {
  const response = await authFetch(`/api/adjusters/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch adjuster');
  }
  return response.json();
}

export async function createInteraction(
  adjusterId: string,
  interaction: {
    date: string;
    type: string;
    description: string;
    outcome?: string;
    claimId?: string;
  }
): Promise<Interaction> {
  const response = await authFetch(`/api/adjusters/${adjusterId}/interactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(interaction),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create interaction');
  }
  
  return response.json();
}

export async function createAdjuster(adjuster: InsertAdjuster): Promise<Adjuster> {
  const response = await authFetch('/api/adjusters', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(adjuster),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create adjuster');
  }
  
  return response.json();
}

export async function updateAdjuster(
  adjusterId: string,
  data: Partial<InsertAdjuster>
): Promise<Adjuster> {
  const response = await authFetch(`/api/adjusters/${adjusterId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error('Failed to update adjuster');
  }
  
  return response.json();
}

export async function fetchAdjusterIntelligence(id: string): Promise<AdjusterIntelligence> {
  const response = await authFetch(`/api/adjusters/${id}/intelligence`);
  if (!response.ok) {
    throw new Error('Failed to fetch adjuster intelligence');
  }
  return response.json();
}

// Carriers API
export async function fetchCarriers(): Promise<string[]> {
  const response = await authFetch('/api/carriers');
  if (!response.ok) {
    throw new Error('Failed to fetch carriers');
  }
  return response.json();
}

export async function fetchCarrierIntelligence(name: string): Promise<CarrierIntelligence> {
  const response = await authFetch(`/api/carriers/${encodeURIComponent(name)}/intelligence`);
  if (!response.ok) {
    throw new Error('Failed to fetch carrier intelligence');
  }
  return response.json();
}

// Claims API
export async function fetchClaims(): Promise<Claim[]> {
  const response = await authFetch('/api/claims');
  if (!response.ok) {
    throw new Error('Failed to fetch claims');
  }
  return response.json();
}

export async function fetchClaim(id: string): Promise<ClaimWithRelations> {
  const response = await authFetch(`/api/claims/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch claim');
  }
  return response.json();
}

export async function createClaim(claim: InsertClaim): Promise<Claim> {
  const response = await authFetch('/api/claims', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(claim),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create claim');
  }
  
  return response.json();
}

export async function updateClaim(
  claimId: string,
  data: Partial<InsertClaim>
): Promise<Claim> {
  const response = await authFetch(`/api/claims/${claimId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error('Failed to update claim');
  }
  
  return response.json();
}

export async function linkAdjusterToClaim(
  claimId: string,
  adjusterId: string
): Promise<void> {
  const response = await authFetch(`/api/claims/${claimId}/adjusters`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ adjusterId }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to link adjuster to claim');
  }
}

// Attachments API
export async function fetchAttachments(claimId: string): Promise<Attachment[]> {
  const response = await authFetch(`/api/claims/${claimId}/attachments`);
  if (!response.ok) {
    throw new Error('Failed to fetch attachments');
  }
  return response.json();
}

export async function createAttachment(
  claimId: string,
  attachment: Omit<InsertAttachment, 'claimId'>
): Promise<Attachment> {
  const response = await authFetch(`/api/claims/${claimId}/attachments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(attachment),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create attachment');
  }
  
  return response.json();
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  const response = await authFetch(`/api/attachments/${attachmentId}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete attachment');
  }
}
