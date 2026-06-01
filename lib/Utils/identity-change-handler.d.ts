export interface IdentityChangeContext {
  meId?: string;
  meLid?: string;
  validateSession: (jid: string) => Promise<{ exists: boolean; reason?: string }>;
  assertSessions: (jids: string[], force: boolean) => Promise<any>;
  debounceCache?: { get(key: string): any; set(key: string, value: any): any };
  logger?: any;
  onBeforeSessionRefresh?: (jid: string) => void;
}
export declare function handleIdentityChange(node: any, ctx: IdentityChangeContext): Promise<any>;
