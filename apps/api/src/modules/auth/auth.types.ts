export interface SessionIdentity {
  userId: string;
  username: string;
}
export interface MutationCredential {
  userId: string;
  sessionId: string;
  tokenHash: Uint8Array;
}
export interface AuthenticatedSession {
  identity: SessionIdentity;
  credential: MutationCredential;
  expiresAt: Date;
  idleExpiresAt: Date;
}
