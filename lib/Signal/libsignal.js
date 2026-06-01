"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeLibSignalRepository = makeLibSignalRepository;
const libsignal = __importStar(require("libsignal"));
let PreKeyWhisperMessage;
try {
    ({ PreKeyWhisperMessage } = require("libsignal/src/protobufs.js"));
}
catch (_) {
    try {
        ({ PreKeyWhisperMessage } = require("libsignal/src/protobufs"));
    }
    catch (_) { }
}
const Utils_1 = require("../Utils");
const WABinary_1 = require("../WABinary");
const sender_key_name_1 = require("./Group/sender-key-name");
const sender_key_record_1 = require("./Group/sender-key-record");
const Group_1 = require("./Group");
const noopLogger = {
    trace() { },
    debug() { },
    info() { },
    warn() { },
    error() { }
};
const isBadMacError = (error) => {
    const message = String((error === null || error === void 0 ? void 0 : error.message) || error || '');
    return /bad mac|invalid mac|mac verification failed/i.test(message);
};
const runTransaction = async (keys, work, label) => {
    if (keys && typeof keys.transaction === 'function') {
        return keys.transaction(work, label);
    }
    return work();
};
/** Extract identity key from PreKeyWhisperMessage for identity change/session reset handling. */
function extractIdentityFromPkmsg(ciphertext) {
    try {
        if (!PreKeyWhisperMessage || !ciphertext || ciphertext.length < 2) {
            return undefined;
        }
        const version = ciphertext[0];
        if ((version & 0x0f) !== 3) {
            return undefined;
        }
        const preKeyProto = PreKeyWhisperMessage.decode(Buffer.from(ciphertext).slice(1));
        if (preKeyProto && preKeyProto.identityKey && preKeyProto.identityKey.length === 33) {
            return new Uint8Array(preKeyProto.identityKey);
        }
    }
    catch (_) { }
    return undefined;
}
function makeLibSignalRepository(auth, logger = noopLogger) {
    const storage = signalStorage(auth, logger);
    const parsedKeys = auth.keys;
    const ensureSenderKeyAndCreateSkdm = async (group, meId) => {
        const senderName = jidToSignalSenderKeyName(group, meId);
        const senderNameStr = senderName.toString();
        const { [senderNameStr]: senderKey } = await auth.keys.get('sender-key', [senderNameStr]);
        if (!senderKey) {
            await storage.storeSenderKey(senderName, new sender_key_record_1.SenderKeyRecord());
        }
        const skdm = await new Group_1.GroupSessionBuilder(storage).create(senderName);
        return { senderName, skdm };
    };
    return {
        decryptGroupMessage({ group, authorJid, msg }) {
            const senderName = jidToSignalSenderKeyName(group, authorJid);
            const cipher = new Group_1.GroupCipher(storage, senderName);
            return runTransaction(parsedKeys, async () => cipher.decrypt(msg), group);
        },
        async processSenderKeyDistributionMessage({ item, authorJid }) {
            if (!item.groupId) {
                throw new Error('Group ID is required for sender key distribution message');
            }
            const builder = new Group_1.GroupSessionBuilder(storage);
            const senderName = jidToSignalSenderKeyName(item.groupId, authorJid);
            const senderMsg = new Group_1.SenderKeyDistributionMessage(null, null, null, null, item.axolotlSenderKeyDistributionMessage);
            const senderNameStr = senderName.toString();
            return runTransaction(parsedKeys, async () => {
                const { [senderNameStr]: senderKey } = await auth.keys.get('sender-key', [senderNameStr]);
                if (!senderKey) {
                    await storage.storeSenderKey(senderName, new sender_key_record_1.SenderKeyRecord());
                }
                await builder.process(senderName, senderMsg);
            }, item.groupId);
        },
        async decryptMessage({ jid, type, ciphertext }) {
            const addr = jidToSignalProtocolAddress(jid);
            const addrStr = addr.toString();
            const session = new libsignal.SessionCipher(storage, addr);
            if (type === 'pkmsg') {
                const identityKey = extractIdentityFromPkmsg(ciphertext);
                if (identityKey && typeof storage.saveIdentity === 'function') {
                    const identityChanged = await storage.saveIdentity(addrStr, identityKey);
                    if (identityChanged) {
                        logger.info({ jid, addr: addrStr }, 'identity key changed or new contact, session will be re-established');
                    }
                }
            }
            const doDecrypt = async () => {
                switch (type) {
                    case 'pkmsg':
                        return session.decryptPreKeyWhisperMessage(ciphertext);
                    case 'msg':
                        return session.decryptWhisperMessage(ciphertext);
                    default:
                        throw new Error(`Unknown message type: ${type}`);
                }
            };
            try {
                return await runTransaction(parsedKeys, doDecrypt, jid);
            }
            catch (error) {
                if (isBadMacError(error)) {
                    logger.warn({ jid, addr: addrStr, error }, 'Bad MAC detected, clearing stale Signal session');
                    await this.deleteSession([jid]);
                }
                throw error;
            }
        },
        async encryptMessage({ jid, data }) {
            const addr = jidToSignalProtocolAddress(jid);
            const cipher = new libsignal.SessionCipher(storage, addr);
            return runTransaction(parsedKeys, async () => {
                const { type: sigType, body } = await cipher.encrypt(data);
                const type = sigType === 3 ? 'pkmsg' : 'msg';
                return { type, ciphertext: Buffer.from(body, 'binary') };
            }, jid);
        },
        async encryptGroupMessage({ group, meId, data }) {
            return runTransaction(parsedKeys, async () => {
                const { senderName, skdm } = await ensureSenderKeyAndCreateSkdm(group, meId);
                const ciphertext = await new Group_1.GroupCipher(storage, senderName).encrypt(data);
                return { ciphertext, senderKeyDistributionMessage: skdm.serialize() };
            }, group);
        },
        async getSenderKeyDistributionMessage({ group, meId }) {
            return runTransaction(parsedKeys, async () => {
                const { skdm } = await ensureSenderKeyAndCreateSkdm(group, meId);
                return skdm.serialize();
            }, group);
        },
        async hasSenderKey({ group, meId }) {
            const senderName = jidToSignalSenderKeyName(group, meId).toString();
            const { [senderName]: key } = await auth.keys.get('sender-key', [senderName]);
            return !!key;
        },
        async getSessionInfo(jid) {
            const addr = jidToSignalProtocolAddress(jid).toString();
            const session = await storage.loadSession(addr);
            if (!session) {
                return null;
            }
            const open = typeof session.getOpenSession === 'function' ? session.getOpenSession() : undefined;
            const baseKey = open === null || open === void 0 ? void 0 : open.indexInfo === null || open.indexInfo === void 0 ? void 0 : open.indexInfo.baseKey;
            const registrationId = open === null || open === void 0 ? void 0 : open.registrationId;
            if (!baseKey || typeof registrationId !== 'number') {
                return null;
            }
            return { baseKey: new Uint8Array(baseKey), registrationId };
        },
        async injectE2ESession({ jid, session }) {
            logger.trace({ jid }, 'injecting E2EE session');
            const cipher = new libsignal.SessionBuilder(storage, jidToSignalProtocolAddress(jid));
            return runTransaction(parsedKeys, async () => {
                await cipher.initOutgoing(session);
            }, jid);
        },
        jidToSignalProtocolAddress(jid) {
            return jidToSignalProtocolAddress(jid).toString();
        },
        async validateSession(jid) {
            try {
                const addr = jidToSignalProtocolAddress(jid);
                const session = await storage.loadSession(addr.toString());
                if (!session) {
                    return { exists: false, reason: 'no session' };
                }
                if (typeof session.haveOpenSession === 'function' && !session.haveOpenSession()) {
                    return { exists: false, reason: 'no open session' };
                }
                return { exists: true };
            }
            catch (_) {
                return { exists: false, reason: 'validation error' };
            }
        },
        async deleteSession(jids) {
            if (!Array.isArray(jids) || !jids.length) {
                return;
            }
            const sessionUpdates = {};
            for (const jid of jids) {
                const addr = jidToSignalProtocolAddress(jid);
                sessionUpdates[addr.toString()] = null;
            }
            return runTransaction(parsedKeys, async () => {
                await auth.keys.set({ session: sessionUpdates });
            }, `delete-${jids.length}-sessions`);
        },
        lidMapping: {},
        close() { }
    };
}
const jidToSignalProtocolAddress = (jid) => {
    const decoded = (0, WABinary_1.jidDecode)(jid) || {};
    const { user, device } = decoded;
    if (!user) {
        throw new Error(`JID decoded but user is empty: "${jid}"`);
    }
    return new libsignal.ProtocolAddress(user, device || 0);
};
const jidToSignalSenderKeyName = (group, user) => {
    return new sender_key_name_1.SenderKeyName(group, jidToSignalProtocolAddress(user));
};
function signalStorage({ creds, keys }, logger = noopLogger) {
    return {
        loadSession: async (id) => {
            try {
                const { [id]: sess } = await keys.get('session', [id]);
                if (sess) {
                    return libsignal.SessionRecord.deserialize(sess);
                }
            }
            catch (error) {
                logger.warn({ id, error }, 'failed to load Signal session');
            }
            return null;
        },
        storeSession: async (id, session) => {
            await keys.set({ session: { [id]: session.serialize() } });
        },
        isTrustedIdentity: () => {
            return true;
        },
        loadIdentityKey: async (id) => {
            const { [id]: key } = await keys.get('identity-key', [id]);
            return key || undefined;
        },
        saveIdentity: async (id, identityKey) => {
            const { [id]: existingKey } = await keys.get('identity-key', [id]);
            const keysMatch = existingKey && existingKey.length === identityKey.length && existingKey.every((byte, i) => byte === identityKey[i]);
            if (existingKey && !keysMatch) {
                await keys.set({
                    session: { [id]: null },
                    'identity-key': { [id]: identityKey }
                });
                return true;
            }
            if (!existingKey) {
                await keys.set({ 'identity-key': { [id]: identityKey } });
                return true;
            }
            return false;
        },
        loadPreKey: async (id) => {
            const keyId = id.toString();
            const { [keyId]: key } = await keys.get('pre-key', [keyId]);
            if (key) {
                return {
                    privKey: Buffer.from(key.private),
                    pubKey: Buffer.from(key.public)
                };
            }
        },
        removePreKey: (id) => keys.set({ 'pre-key': { [id]: null } }),
        loadSignedPreKey: () => {
            const key = creds.signedPreKey;
            return {
                privKey: Buffer.from(key.keyPair.private),
                pubKey: Buffer.from(key.keyPair.public)
            };
        },
        loadSenderKey: async (senderKeyName) => {
            const keyId = senderKeyName.toString();
            const { [keyId]: key } = await keys.get('sender-key', [keyId]);
            if (key) {
                return sender_key_record_1.SenderKeyRecord.deserialize(key);
            }
            return new sender_key_record_1.SenderKeyRecord();
        },
        storeSenderKey: async (senderKeyName, key) => {
            const keyId = senderKeyName.toString();
            const serialized = JSON.stringify(key.serialize());
            await keys.set({ 'sender-key': { [keyId]: Buffer.from(serialized, 'utf-8') } });
        },
        getOurRegistrationId: () => creds.registrationId,
        getOurIdentity: () => {
            const { signedIdentityKey } = creds;
            return {
                privKey: Buffer.from(signedIdentityKey.private),
                pubKey: Buffer.from((0, Utils_1.generateSignalPubKey)(signedIdentityKey.public))
            };
        }
    };
}
