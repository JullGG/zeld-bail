import { proto } from '../../WAProto';
type DecryptGroupSignalOpts = {
    group: string;
    authorJid: string;
    msg: Uint8Array;
};
type ProcessSenderKeyDistributionMessageOpts = {
    item: proto.Message.ISenderKeyDistributionMessage;
    authorJid: string;
};
type DecryptSignalProtoOpts = {
    jid: string;
    type: 'pkmsg' | 'msg';
    ciphertext: Uint8Array;
};
type EncryptMessageOpts = {
    jid: string;
    data: Uint8Array;
};
type EncryptGroupMessageOpts = {
    group: string;
    data: Uint8Array;
    meId: string;
};
type GetSenderKeyDistributionMessageOpts = {
    group: string;
    meId: string;
};
type PreKey = {
    keyId: number;
    publicKey: Uint8Array;
};
type SignedPreKey = PreKey & {
    signature: Uint8Array;
};
type E2ESession = {
    registrationId: number;
    identityKey: Uint8Array;
    signedPreKey: SignedPreKey;
    preKey?: PreKey;
};
type E2ESessionOpts = {
    jid: string;
    session: E2ESession;
};
export type SignalRepository = {
    decryptGroupMessage(opts: DecryptGroupSignalOpts): Promise<Uint8Array>;
    processSenderKeyDistributionMessage(opts: ProcessSenderKeyDistributionMessageOpts): Promise<void>;
    decryptMessage(opts: DecryptSignalProtoOpts): Promise<Uint8Array>;
    encryptMessage(opts: EncryptMessageOpts): Promise<{
        type: 'pkmsg' | 'msg';
        ciphertext: Uint8Array;
    }>;
    encryptGroupMessage(opts: EncryptGroupMessageOpts): Promise<{
        senderKeyDistributionMessage: Uint8Array;
        ciphertext: Uint8Array;
    }>;
    getSenderKeyDistributionMessage?(opts: GetSenderKeyDistributionMessageOpts): Promise<Uint8Array>;
    hasSenderKey?(opts: GetSenderKeyDistributionMessageOpts): Promise<boolean>;
    getSessionInfo?(jid: string): Promise<{
        baseKey: Uint8Array;
        registrationId: number;
    } | null>;
    injectE2ESession(opts: E2ESessionOpts): Promise<void>;
    jidToSignalProtocolAddress(jid: string): string;
    validateSession?(jid: string): Promise<{ exists: boolean; reason?: string }>;
    deleteSession?(jids: string[]): Promise<void>;
    lidMapping?: {
        getLIDForPN(pnJid: string): Promise<string | undefined> | string | undefined;
        getPNForLID?(lidJid: string): Promise<string | undefined> | string | undefined;
    };
    close?(): void;
};
export {};
