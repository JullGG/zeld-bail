import { AuthenticationCreds } from '../Types';
export type RenvyDatabaseStore = {
    get(key: string): Promise<any> | any;
    set(key: string, value: any, ttl?: number): Promise<any> | any;
    delete?(key: string): Promise<any> | any;
    del?(key: string): Promise<any> | any;
    remove?(key: string): Promise<any> | any;
    clear?(): Promise<any> | any;
    iterator?(): AsyncIterable<[string, any]>;
};
export declare const makeKeyvAuthState: (store: RenvyDatabaseStore, sessionKey?: string, options?: {
    prefix?: string;
    ttl?: number;
    credsTtl?: number;
    clearAll?: boolean;
}) => Promise<{
    clearState: () => Promise<void>;
    saveCreds: () => Promise<void>;
    state: {
        creds: AuthenticationCreds;
        keys: {
            get: (type: string, ids: string[]) => Promise<Record<string, any>>;
            set: (data: any) => Promise<void>;
        };
    };
}>;
export declare const makeDatabaseAuthState: typeof makeKeyvAuthState;
export default makeKeyvAuthState;
