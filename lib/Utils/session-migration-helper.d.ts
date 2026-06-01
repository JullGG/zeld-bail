export declare function buildSessionMigrationPlan(sessions: Record<string, any>, resolver: (oldId: string) => string | undefined): Array<{ from: string; to: string }>;
export declare function migrateSessionKeys(keys: any, plan: Array<{ from: string; to: string }>, logger?: any): Promise<{ migrated: number }>;
