export type Agent = { id: number; name: string; email: string; level: number; parent_id?: number | null; };
export type TokenPayload = { token: string; agent: { id: number; name: string; level: number } };
