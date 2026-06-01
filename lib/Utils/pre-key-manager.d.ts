export declare class PreKeyManager {
  constructor(store: any, logger?: any);
  getQueue(keyType: string): any;
  processOperations(data: any, keyType: string, transactionCache: any, mutations: any, isInTransaction: boolean): Promise<any>;
  processDeletions(keyType: string, ids: string[], transactionCache: any, mutations: any, isInTransaction: boolean): Promise<any>;
  validateDeletions(data: any, keyType: string): Promise<any>;
}
