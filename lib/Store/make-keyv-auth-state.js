"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeDatabaseAuthState = exports.makeKeyvAuthState = void 0;
const WAProto_1 = require("../../WAProto");
const Utils_1 = require("../Utils");
const logger_1 = require("../Utils/logger");

const getLogger = () => (logger_1 && (logger_1.default || logger_1)) || console;

/**
 * Renvy Bail Fast Plus optional database session.
 * Store adapter cukup punya method: get(key), set(key, value, ttl?), delete/del(key), clear?().
 * Cocok untuk Keyv, Redis wrapper, Mongo wrapper, SQLite wrapper, atau adapter custom.
 */
const makeKeyvAuthState = async (store, sessionKey = 'renvy-session', options = {}) => {
    if (!store || typeof store.get !== 'function' || typeof store.set !== 'function') {
        throw new Error('makeKeyvAuthState requires a store with get() and set() methods');
    }
    const prefix = options.prefix || sessionKey;
    const ttl = options.ttl;
    const credsTtl = options.credsTtl || ttl;
    const keyName = (file) => `${prefix}:${file}`;
    const remove = async (key) => {
        if (typeof store.delete === 'function') return await store.delete(key);
        if (typeof store.del === 'function') return await store.del(key);
        if (typeof store.remove === 'function') return await store.remove(key);
        return undefined;
    };
    const writeData = async (file, data) => {
        const value = JSON.stringify(data, Utils_1.BufferJSON.replacer);
        const finalTtl = file === 'creds' ? credsTtl : ttl;
        if (typeof finalTtl === 'number') return await store.set(keyName(file), value, finalTtl);
        return await store.set(keyName(file), value);
    };
    const readData = async (file) => {
        try {
            const data = await store.get(keyName(file));
            if (!data) return null;
            return typeof data === 'string' ? JSON.parse(data, Utils_1.BufferJSON.reviver) : data;
        } catch (error) {
            getLogger().error?.(error);
            return null;
        }
    };
    const removeData = async (file) => {
        try {
            return await remove(keyName(file));
        } catch (error) {
            getLogger().error?.(`Error removing ${file} from session ${sessionKey}: ${error?.message || error}`);
        }
    };
    const clearState = async () => {
        try {
            if (typeof store.clear === 'function' && options.clearAll === true) {
                return await store.clear();
            }
            if (typeof store.iterator === 'function') {
                for await (const [key] of store.iterator()) {
                    if (String(key).startsWith(`${prefix}:`)) await remove(key);
                }
            }
        } catch (error) {
            getLogger().error?.('Error clearing auth state:', error);
        }
    };
    const creds = (await readData('creds')) || (0, Utils_1.initAuthCreds)();
    return {
        clearState,
        saveCreds: () => writeData('creds', creds),
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = WAProto_1.proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(key, value) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                },
            }
        }
    };
};
exports.makeKeyvAuthState = makeKeyvAuthState;
exports.makeDatabaseAuthState = makeKeyvAuthState;
exports.default = makeKeyvAuthState;
