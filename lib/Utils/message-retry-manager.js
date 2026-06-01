"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageRetryManager = exports.RetryReason = void 0;
const RECENT_MESSAGES_SIZE = 512;
const MESSAGE_KEY_SEPARATOR = '\u0000';
const RECREATE_SESSION_TIMEOUT = 60 * 60 * 1000;
const PHONE_REQUEST_DELAY = 3000;
var RetryReason;
(function (RetryReason) {
    RetryReason[RetryReason["UnknownError"] = 0] = "UnknownError";
    RetryReason[RetryReason["SignalErrorNoSession"] = 1] = "SignalErrorNoSession";
    RetryReason[RetryReason["SignalErrorInvalidKey"] = 2] = "SignalErrorInvalidKey";
    RetryReason[RetryReason["SignalErrorInvalidKeyId"] = 3] = "SignalErrorInvalidKeyId";
    RetryReason[RetryReason["SignalErrorInvalidMessage"] = 4] = "SignalErrorInvalidMessage";
    RetryReason[RetryReason["SignalErrorInvalidSignature"] = 5] = "SignalErrorInvalidSignature";
    RetryReason[RetryReason["SignalErrorFutureMessage"] = 6] = "SignalErrorFutureMessage";
    RetryReason[RetryReason["SignalErrorBadMac"] = 7] = "SignalErrorBadMac";
    RetryReason[RetryReason["SignalErrorInvalidSession"] = 8] = "SignalErrorInvalidSession";
    RetryReason[RetryReason["SignalErrorInvalidMsgKey"] = 9] = "SignalErrorInvalidMsgKey";
    RetryReason[RetryReason["BadBroadcastEphemeralSetting"] = 10] = "BadBroadcastEphemeralSetting";
    RetryReason[RetryReason["UnknownCompanionNoPrekey"] = 11] = "UnknownCompanionNoPrekey";
    RetryReason[RetryReason["AdvFailure"] = 12] = "AdvFailure";
    RetryReason[RetryReason["StatusRevokeDelay"] = 13] = "StatusRevokeDelay";
})(RetryReason || (exports.RetryReason = RetryReason = {}));
const MAC_ERROR_CODES = new Set([RetryReason.SignalErrorInvalidMessage, RetryReason.SignalErrorBadMac]);
class TinyTTLMap {
    constructor({ max = Infinity, ttl = 0, dispose } = {}) {
        this.max = max;
        this.ttl = ttl;
        this.dispose = dispose;
        this.map = new Map();
    }
    _expired(entry) { return this.ttl > 0 && entry.expiresAt <= Date.now(); }
    _delete(key, value) {
        this.map.delete(key);
        try { this.dispose?.(value, key); } catch (_) {}
    }
    _trim() {
        while (this.map.size > this.max) {
            const first = this.map.keys().next().value;
            const entry = this.map.get(first);
            this._delete(first, entry?.value);
        }
    }
    set(key, value) {
        if (this.map.has(key)) this.map.delete(key);
        this.map.set(key, { value, expiresAt: this.ttl > 0 ? Date.now() + this.ttl : Number.MAX_SAFE_INTEGER });
        this._trim();
    }
    get(key) {
        const entry = this.map.get(key);
        if (!entry) return undefined;
        if (this._expired(entry)) {
            this._delete(key, entry.value);
            return undefined;
        }
        this.map.delete(key);
        this.map.set(key, entry);
        return entry.value;
    }
    delete(key) {
        const entry = this.map.get(key);
        if (!entry) return false;
        this._delete(key, entry.value);
        return true;
    }
    clear() {
        for (const [key, entry] of this.map.entries()) this._delete(key, entry.value);
    }
}
class MessageRetryManager {
    constructor(logger, maxMsgRetryCount = 5) {
        this.logger = logger;
        this.messageKeyIndex = new Map();
        this.pendingPhoneRequests = {};
        this.maxMsgRetryCount = maxMsgRetryCount || 5;
        this.statistics = {
            totalRetries: 0,
            successfulRetries: 0,
            failedRetries: 0,
            mediaRetries: 0,
            sessionRecreations: 0,
            phoneRequests: 0
        };
        this.recentMessagesMap = new TinyTTLMap({
            max: RECENT_MESSAGES_SIZE,
            ttl: 5 * 60 * 1000,
            dispose: (_value, key) => {
                const separatorIndex = String(key).lastIndexOf(MESSAGE_KEY_SEPARATOR);
                if (separatorIndex > -1) {
                    const messageId = String(key).slice(separatorIndex + MESSAGE_KEY_SEPARATOR.length);
                    this.messageKeyIndex.delete(messageId);
                }
            }
        });
        this.sessionRecreateHistory = new TinyTTLMap({ ttl: RECREATE_SESSION_TIMEOUT * 2 });
        this.retryCounters = new TinyTTLMap({ ttl: 15 * 60 * 1000 });
        this.baseKeys = new TinyTTLMap({ max: 1024, ttl: 15 * 60 * 1000 });
    }
    addRecentMessage(to, id, message) {
        if (!to || !id || !message) return;
        const keyStr = this.keyToString({ to, id });
        this.recentMessagesMap.set(keyStr, { message, timestamp: Date.now() });
        this.messageKeyIndex.set(id, keyStr);
        this.logger?.debug?.(`Added message to retry cache: ${to}/${id}`);
    }
    getRecentMessage(to, id) {
        return this.recentMessagesMap.get(this.keyToString({ to, id }));
    }
    shouldRecreateSession(jid, hasSession, errorCode) {
        if (!hasSession) {
            this.sessionRecreateHistory.set(jid, Date.now());
            this.statistics.sessionRecreations++;
            return { reason: "we don't have a Signal session with them", recreate: true };
        }
        if (errorCode !== undefined && MAC_ERROR_CODES.has(errorCode)) {
            this.sessionRecreateHistory.set(jid, Date.now());
            this.statistics.sessionRecreations++;
            this.logger?.warn?.({ jid, errorCode: RetryReason[errorCode] }, 'MAC error detected, forcing immediate session recreation');
            return { reason: `MAC error (code ${errorCode}: ${RetryReason[errorCode]}), immediate session recreation`, recreate: true };
        }
        const now = Date.now();
        const prevTime = this.sessionRecreateHistory.get(jid);
        if (!prevTime || now - prevTime > RECREATE_SESSION_TIMEOUT) {
            this.sessionRecreateHistory.set(jid, now);
            this.statistics.sessionRecreations++;
            return { reason: 'retry count > 1 and over an hour since last recreation', recreate: true };
        }
        return { reason: '', recreate: false };
    }
    parseRetryErrorCode(errorAttr) {
        if (errorAttr === undefined || errorAttr === '') return undefined;
        const code = parseInt(errorAttr, 10);
        if (Number.isNaN(code)) return undefined;
        if (code >= RetryReason.UnknownError && code <= RetryReason.StatusRevokeDelay) return code;
        return RetryReason.UnknownError;
    }
    isMacError(errorCode) { return errorCode !== undefined && MAC_ERROR_CODES.has(errorCode); }
    incrementRetryCount(messageId) {
        this.retryCounters.set(messageId, (this.retryCounters.get(messageId) || 0) + 1);
        this.statistics.totalRetries++;
        return this.retryCounters.get(messageId) || 0;
    }
    getRetryCount(messageId) { return this.retryCounters.get(messageId) || 0; }
    hasExceededMaxRetries(messageId) { return this.getRetryCount(messageId) >= this.maxMsgRetryCount; }
    markRetrySuccess(messageId) {
        this.statistics.successfulRetries++;
        this.retryCounters.delete(messageId);
        this.cancelPendingPhoneRequest(messageId);
        this.removeRecentMessage(messageId);
    }
    markRetryFailed(messageId) {
        this.statistics.failedRetries++;
        this.retryCounters.delete(messageId);
        this.cancelPendingPhoneRequest(messageId);
        this.removeRecentMessage(messageId);
    }
    schedulePhoneRequest(messageId, callback, delay = PHONE_REQUEST_DELAY) {
        this.cancelPendingPhoneRequest(messageId);
        this.pendingPhoneRequests[messageId] = setTimeout(() => {
            delete this.pendingPhoneRequests[messageId];
            this.statistics.phoneRequests++;
            callback();
        }, delay);
        this.logger?.debug?.(`Scheduled phone request for message ${messageId} with ${delay}ms delay`);
    }
    cancelPendingPhoneRequest(messageId) {
        const timeout = this.pendingPhoneRequests[messageId];
        if (timeout) {
            clearTimeout(timeout);
            delete this.pendingPhoneRequests[messageId];
            this.logger?.debug?.(`Cancelled pending phone request for message ${messageId}`);
        }
    }
    clear() {
        this.recentMessagesMap.clear();
        this.messageKeyIndex.clear();
        this.sessionRecreateHistory.clear();
        this.retryCounters.clear();
        this.baseKeys.clear();
        for (const messageId of Object.keys(this.pendingPhoneRequests)) this.cancelPendingPhoneRequest(messageId);
        this.statistics = { totalRetries: 0, successfulRetries: 0, failedRetries: 0, mediaRetries: 0, sessionRecreations: 0, phoneRequests: 0 };
    }
    saveBaseKey(addr, msgId, baseKey) { this.baseKeys.set(`${addr}:${msgId}`, Buffer.from(baseKey)); }
    hasSameBaseKey(addr, msgId, baseKey) {
        const stored = this.baseKeys.get(`${addr}:${msgId}`);
        if (!stored || stored.length !== baseKey.length) return false;
        for (let i = 0; i < stored.length; i++) if (stored[i] !== baseKey[i]) return false;
        return true;
    }
    deleteBaseKey(addr, msgId) { this.baseKeys.delete(`${addr}:${msgId}`); }
    keyToString(key) { return `${key.to}${MESSAGE_KEY_SEPARATOR}${key.id}`; }
    removeRecentMessage(messageId) {
        const keyStr = this.messageKeyIndex.get(messageId);
        if (!keyStr) return;
        this.recentMessagesMap.delete(keyStr);
        this.messageKeyIndex.delete(messageId);
    }
}
exports.MessageRetryManager = MessageRetryManager;
