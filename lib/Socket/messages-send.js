"use strict"; 
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
}; 
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeMessagesSocket = void 0;
const boom_1 = require("@hapi/boom");
const node_cache_1 = __importDefault(require("node-cache"));
const WAProto_1 = require("../../WAProto");
const Defaults_1 = require("../Defaults");
const axios_1 = require("axios")
const Types_1 = require("../Types")
const Utils_1 = require("../Utils");
const link_preview_1 = require("../Utils/link-preview");
const WABinary_1 = require("../WABinary");
const newsletter_1 = require("./newsletter");
const WAUSync_1 = require("../WAUSync")
const kikyy = require('./dugong');
var ListType = WAProto_1.proto.Message.ListMessage.ListType;
const makeMessagesSocket = (config) => {
    const {
        logger,
        linkPreviewImageThumbnailWidth, 
        generateHighQualityLinkPreview,
        options: axiosOptions,
        patchMessageBeforeSending,
        cachedGroupMetadata,
        enableRecentMessageCache,
        maxMsgRetryCount
    } = config;
    const sock = (0, newsletter_1.makeNewsletterSocket)(config);
    const {
        ev, 
        authState, 
        processingMutex, 
        signalRepository, 
        upsertMessage,
        query,
        fetchPrivacySettings,
        generateMessageTag,
        sendNode, 
        groupMetadata,
        groupToggleEphemeral,
        executeUSyncQuery
    } = sock;
    const messageRetryManager = enableRecentMessageCache === false ? null : new Utils_1.MessageRetryManager(logger, maxMsgRetryCount || 5);
    try { sock.ws?.on?.('close', () => messageRetryManager?.clear?.()); } catch (_) {}
    const isRateOverlimitError = (error) => {
        const text = String(error?.message || error?.output?.payload?.message || error?.data?.tag || error?.data?.attrs?.type || error || '').toLowerCase();
        return text.includes('rate-overlimit') || text.includes('rate overlimit') || text.includes('overlimit');
    };
    const isNoSessionError = (error) => {
        const text = String(error?.message || error?.stack || error?.output?.payload?.message || error || '').toLowerCase();
        return text.includes('no sessions') || (text.includes('sessionerror') && text.includes('no session'));
    };
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const lidMappingCache = new Map();
    const pnMappingCache = new Map();
    const normalizeRtcJid = (jid, fallbackServer = 's.whatsapp.net') => {
        jid = String(jid || '').trim();
        if (!jid) return '';
        if (jid.includes('@')) return WABinary_1.jidNormalizedUser(jid);
        return WABinary_1.jidNormalizedUser(jid + '@' + fallbackServer);
    };
    const deviceToJid = (device, fallbackServer = 's.whatsapp.net') => {
        if (!device) return '';
        if (device.jid) return WABinary_1.jidNormalizedUser(device.jid);
        if (!device.user) return '';
        return WABinary_1.jidEncode(device.user, device.server || fallbackServer, device.device);
    };
    // Renvy Bail v11 Ultra Fast: queue OFF by default. Set sendQueueEnabled: true if you want protection mode.
    const SEND_QUEUE_ENABLED = config.sendQueueEnabled === true;
    const SEND_QUEUE_INTERVAL = Math.max(0, Number(config.sendQueueIntervalMs ?? 0));
    const SEND_QUEUE_CONCURRENCY = Math.max(1, Number(config.sendQueueConcurrency ?? 20));
    // Renvy Bail v11 Ultra Fast: retry OFF by default so command replies are not delayed.
    const SEND_RETRY_COUNT = Math.max(0, Number(config.sendRetryCount ?? 0));
    const SEND_RETRY_BASE_DELAY = Math.max(0, Number(config.sendRetryBaseDelayMs ?? 0));
    const SEND_RETRY_MAX_DELAY = Math.max(SEND_RETRY_BASE_DELAY, Number(config.sendRetryMaxDelayMs ?? 1000));
    const RENVY_ANTI_CRASH = config.antiCrash !== false;
    // Safe default: jangan skip device session karena bisa membuat penerima melihat `menunggu pesan`.
    // Aktifkan manual hanya kalau benar-benar butuh ultra fast mode.
    const FAST_NO_SESSION_SKIP = config.fastNoSessionSkip === true;
    // Safe default: group send mengikuti Baileys ori, wajib punya metadata peserta sebelum kirim sender-key.
    // Aktifkan manual dengan renvyFastGroupSend: true jika ingin mode ultra fast berisiko.
    const RENVY_FAST_GROUP_SEND = config.renvyFastGroupSend === true;
    const RENVY_FAST_GROUP_BACKGROUND_REFRESH = config.renvyFastGroupBackgroundRefresh !== false;
    const RENVY_FAST_GROUP_CACHE_TIMEOUT = Math.max(0, Number(config.renvyFastGroupCacheTimeoutMs ?? 80));
    const makeMinimalGroupData = (jid) => ({ id: jid, subject: '', addressingMode: 'pn', participants: [], size: 0 });
    const quickValue = async (promise, timeoutMs = 80) => {
        if (!timeoutMs) return await promise;
        let timer;
        try {
            return await Promise.race([
                Promise.resolve(promise).catch(() => undefined),
                new Promise(resolve => { timer = setTimeout(() => resolve(undefined), timeoutMs); })
            ]);
        } finally {
            if (timer) clearTimeout(timer);
        }
    };
    const SEND_QUEUE_MAX_AGE = Math.max(30000, Number(config.sendQueueMaxAgeMs ?? 2 * 60 * 1000));
    const AUTO_CLEAR_CACHE_INTERVAL = Math.max(60000, Number(config.autoClearCacheIntervalMs ?? 5 * 60 * 1000));
    const sendQueue = [];
    let sendQueueActive = 0;
    let lastQueuedSendAt = 0;
    const isRetryableSendError = (error) => {
        const status = Number(error?.output?.statusCode || error?.status || error?.statusCode || 0);
        const text = String(error?.message || error?.output?.payload?.message || error?.data?.tag || error?.data?.attrs?.type || error || '').toLowerCase();
        return isRateOverlimitError(error)
            || isNoSessionError(error)
            || [408, 425, 429, 500, 502, 503, 504].includes(status)
            || text.includes('timed out')
            || text.includes('timeout')
            || text.includes('connection closed')
            || text.includes('connection lost')
            || text.includes('stream:error')
            || text.includes('stream error')
            || text.includes('bad session')
            || text.includes('message not supported')
            || text.includes('restart required')
            || text.includes('unavailable')
            || text.includes('temporarily')
            || text.includes('socket closed')
            || text.includes('closed before');
    };
    const makeSafeSentMessage = (jid, message, msgId) => {
        try {
            return Types_1.WAProto.WebMessageInfo.fromObject({
                key: { remoteJid: jid, fromMe: true, id: msgId || (0, Utils_1.generateMessageID)() },
                message: Types_1.WAProto.Message.fromObject(message || {}),
                messageTimestamp: Utils_1.unixTimestampSeconds(new Date()),
                messageStubParameters: [],
                status: Types_1.WAMessageStatus.PENDING
            });
        } catch (_) {
            return { key: { remoteJid: jid, fromMe: true, id: msgId || (0, Utils_1.generateMessageID)() }, message: message || {} };
        }
    };
    const safeSocketCall = (name, fn) => async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            const jid = args[0];
            if (RENVY_ANTI_CRASH && isRetryableSendError(error)) {
                logger?.warn?.({ jid, name, error: error?.message || String(error) }, `Renvy anti-crash handled ${name} error`);
                if (name === 'sendMessage') {
                    return makeSafeSentMessage(jid, {}, undefined);
                }
                return undefined;
            }
            throw error;
        }
    };
    const cleanupSendQueue = () => {
        const now = Date.now();
        let removed = 0;
        for (let i = sendQueue.length - 1; i >= 0; i--) {
            const item = sendQueue[i];
            if (item?.createdAt && now - item.createdAt > SEND_QUEUE_MAX_AGE) {
                sendQueue.splice(i, 1);
                removed++;
                try {
                    item.reject(new boom_1.Boom('Renvy send queue item expired', { statusCode: 408 }));
                } catch (_) {}
            }
        }
        try { userDevicesCache?.pruneExpired?.(); } catch (_) {}
        if (removed) logger?.trace?.({ removed }, 'Renvy auto cleared expired send queue items');
    };
    const runQueuedSend = (task, meta = {}) => {
        if (!SEND_QUEUE_ENABLED) return task();
        return new Promise((resolve, reject) => {
            sendQueue.push({ task, meta, resolve, reject, createdAt: Date.now() });
            processSendQueue();
        });
    };
    const processSendQueue = () => {
        while (sendQueueActive < SEND_QUEUE_CONCURRENCY && sendQueue.length) {
            const item = sendQueue.shift();
            sendQueueActive++;
            (async () => {
                const wait = Math.max(0, SEND_QUEUE_INTERVAL - (Date.now() - lastQueuedSendAt));
                if (wait) await sleep(wait);
                lastQueuedSendAt = Date.now();
                try {
                    const result = await item.task();
                    item.resolve(result);
                } catch (error) {
                    item.reject(error);
                } finally {
                    sendQueueActive--;
                    processSendQueue();
                }
            })();
        }
    };
    const withSendRetry = async (task, meta = {}) => {
        let lastError;
        for (let attempt = 0; attempt <= SEND_RETRY_COUNT; attempt++) {
            try {
                return await task();
            } catch (error) {
                lastError = error;
                if (isNoSessionError(error)) throw error;
                if (attempt >= SEND_RETRY_COUNT || !isRetryableSendError(error)) throw error;
                const rateBonus = isRateOverlimitError(error) ? 1500 : 0;
                const delay = Math.min(SEND_RETRY_MAX_DELAY, SEND_RETRY_BASE_DELAY * Math.pow(2, attempt) + rateBonus + Math.floor(Math.random() * 500));
                logger?.warn?.({ jid: meta.jid, type: meta.type, attempt: attempt + 1, retryInMs: delay, error: error?.message || String(error) }, 'send failed, retrying with Renvy queue');
                await sleep(delay);
            }
        }
        throw lastError;
    };
    const userDevicesCache = config.userDevicesCache || new node_cache_1.default({
        stdTTL: Defaults_1.DEFAULT_CACHE_TTLS.USER_DEVICES,
        useClones: false
    });
    if (config.autoClearCache !== false) {
        const sendCacheCleaner = setInterval(cleanupSendQueue, AUTO_CLEAR_CACHE_INTERVAL);
        sendCacheCleaner.unref?.();
        sock.ws?.on?.('close', () => clearInterval(sendCacheCleaner));
    }
    let mediaConn;
    const refreshMediaConn = async (forceGet = false) => {
        const media = await mediaConn;
        if (!media || forceGet || (new Date().getTime() - media.fetchDate.getTime()) > media.ttl * 1000) {
            mediaConn = (async () => {
                const result = await query({
                    tag: 'iq',
                    attrs: {
                        type: 'set',
                        xmlns: 'w:m',
                        to: WABinary_1.S_WHATSAPP_NET,
                    },
                    content: [{ tag: 'media_conn', attrs: {} }]
                });
                const mediaConnNode = WABinary_1.getBinaryNodeChild(result, 'media_conn');
                const node = {
                    hosts: WABinary_1.getBinaryNodeChildren(mediaConnNode, 'host').map(({ attrs }) => ({
                        hostname: attrs.hostname,
                        maxContentLengthBytes: +attrs.maxContentLengthBytes,
                    })),
                    auth: mediaConnNode.attrs.auth,
                    ttl: +mediaConnNode.attrs.ttl,
                    fetchDate: new Date()
                };
                logger.debug('fetched media conn');
                return node;
            })();
        }
        return mediaConn;
    };
    /**
     * generic send receipt function
     * used for receipts of phone call, read, delivery etc.
     * */
    const sendReceipt = async (jid, participant, messageIds, type) => {
        const node = {
            tag: 'receipt',
            attrs: {
                id: messageIds[0],
            },
        };
        const isReadReceipt = type === 'read' || type === 'read-self';
        if (isReadReceipt) {
            node.attrs.t = (0, Utils_1.unixTimestampSeconds)().toString();
        }
        if (type === 'sender' && WABinary_1.isJidUser(jid)) {
            node.attrs.recipient = jid;
            node.attrs.to = participant;
        }
        else {
            node.attrs.to = jid;
            if (participant) {
                node.attrs.participant = participant;
            }
        }
        if (type) {
            node.attrs.type = WABinary_1.isJidNewsLetter(jid) ? 'read-self' : type;
        }
        const remainingMessageIds = messageIds.slice(1);
        if (remainingMessageIds.length) {
            node.content = [
                {
                    tag: 'list',
                    attrs: {},
                    content: remainingMessageIds.map(id => ({
                        tag: 'item',
                        attrs: { id }
                    }))
                }
            ];
        }
        logger.debug({ attrs: node.attrs, messageIds }, 'sending receipt for messages');
        await sendNode(node);
    };
    /** Correctly bulk send receipts to multiple chats, participants */
    const sendReceipts = async (keys, type) => {
        const recps = (0, Utils_1.aggregateMessageKeysNotFromMe)(keys);
        for (const { jid, participant, messageIds } of recps) {
            await sendReceipt(jid, participant, messageIds, type);
        }
    };
    /** Bulk read messages. Keys can be from different chats & participants */
    const readMessages = async (keys) => {
        const privacySettings = await fetchPrivacySettings();
        // based on privacy settings, we have to change the read type
        const readType = privacySettings.readreceipts === 'all' ? 'read' : 'read-self';
        await sendReceipts(keys, readType);
    };
    /** Fetch all the devices we've to send a message to */
    const getUSyncDevices = async (jids, useCache, ignoreZeroDevices) => {
        const deviceResults = []

        if (!useCache) {
            logger.debug('not using cache for devices')
        }

        const toFetch = []
        const serverByUser = {}

        jids = Array.from(new Set(jids))

        for (let jid of jids) {
            const decoded = WABinary_1.jidDecode(jid)
            const user = decoded?.user

            jid = WABinary_1.jidNormalizedUser(jid)
            if (user) serverByUser[user] = decoded?.server || (jid.endsWith('@lid') ? 'lid' : 's.whatsapp.net')

            if (useCache) {
                const devices = userDevicesCache.get(user)

                if (devices) {
                    deviceResults.push(...devices)
                    logger.trace({ user }, 'using cache for devices')
                }

                else {
                    toFetch.push(jid)
                }
            }

            else {
                toFetch.push(jid)
            }
        }

        if (!toFetch.length) {
            return deviceResults
        }

        let deviceQuery = new WAUSync_1.USyncQuery()
            .withContext('message')
            .withDeviceProtocol()
        if (typeof deviceQuery.withLIDProtocol === 'function') {
            deviceQuery = deviceQuery.withLIDProtocol()
        }
        const query = deviceQuery

        for (const jid of toFetch) {
            query.withUser(new WAUSync_1.USyncUser().withId(jid))
        }

        const result = await executeUSyncQuery(query)

        if (result) {
            const extracted = Utils_1.extractDeviceJids(result?.list, authState.creds.me.id, authState.creds.me?.lid, ignoreZeroDevices)
            const deviceMap = {}

            for (const item of extracted) {
                const withJid = {
                    ...item,
                    jid: deviceToJid(item, serverByUser[item.user] || 's.whatsapp.net')
                }
                deviceMap[item.user] = deviceMap[item.user] || []
                deviceMap[item.user].push(withJid)
                deviceResults.push(withJid)
            }

            for (const key in deviceMap) {
                userDevicesCache.set(key, deviceMap[key])
            }
        }

        return deviceResults
    }
    const getLIDForPN = async (pnJid, useCache = true) => {
        const normalizedPn = normalizeRtcJid(pnJid, 's.whatsapp.net');
        if (!normalizedPn) return undefined;
        if (normalizedPn.endsWith('@lid')) return normalizedPn;
        if (useCache && lidMappingCache.has(normalizedPn)) {
            return lidMappingCache.get(normalizedPn);
        }
        try {
            const query = new WAUSync_1.USyncQuery()
                .withContext('interactive')
                .withLIDProtocol();

            query.withUser(new WAUSync_1.USyncUser().withId(normalizedPn));

            const result = await executeUSyncQuery(query);
            const entry = result?.list?.find(item => WABinary_1.jidNormalizedUser(item?.id) === normalizedPn) || result?.list?.[0];
            let lid = entry?.lid;
            if (lid && !String(lid).includes('@')) {
                lid = String(lid) + '@lid';
            }
            lid = lid ? normalizeRtcJid(lid, 'lid') : undefined;
            if (lid) {
                lidMappingCache.set(normalizedPn, lid);
                pnMappingCache.set(lid, normalizedPn);
            }
            return lid;
        } catch (err) {
            logger.debug({ err, pnJid: normalizedPn }, 'failed to resolve LID for PN');
            return undefined;
        }
    };
    const getPNForLID = async (lidJid, useCache = true) => {
        const normalizedLid = normalizeRtcJid(lidJid, 'lid');
        if (!normalizedLid) return undefined;
        if (normalizedLid.endsWith('@s.whatsapp.net')) return normalizedLid;
        if (useCache && pnMappingCache.has(normalizedLid)) {
            return pnMappingCache.get(normalizedLid);
        }
        return undefined;
    };
    try {
        if (signalRepository) {
            signalRepository.lidMapping = signalRepository.lidMapping || {};
            signalRepository.lidMapping.getLIDForPN = getLIDForPN;
            signalRepository.lidMapping.getPNForLID = getPNForLID;
        }
    } catch (_) {}
    const assertSessions = async (jids, force) => {
        let didFetchNewSession = false;
        let jidsRequiringFetch = [];
        if (force) {
            jidsRequiringFetch = jids;
        }
        else {
            const addrs = jids.map(jid => (signalRepository
                .jidToSignalProtocolAddress(jid)));
            const sessions = await authState.keys.get('session', addrs);
            for (const jid of jids) {
                const signalId = signalRepository
                    .jidToSignalProtocolAddress(jid);
                if (!sessions[signalId]) {
                    jidsRequiringFetch.push(jid);
                }
            }
        }
        if (jidsRequiringFetch.length) {
            logger.debug({ jidsRequiringFetch }, 'fetching sessions');
            const result = await query({
                tag: 'iq',
                attrs: {
                    xmlns: 'encrypt',
                    type: 'get',
                    to: WABinary_1.S_WHATSAPP_NET,
                },
                content: [
                    {
                        tag: 'key',
                        attrs: {},
                        content: jidsRequiringFetch.map(jid => ({
                            tag: 'user',
                            attrs: { jid },
                        }))
                    }
                ]
            });
            await (0, Utils_1.parseAndInjectE2ESessions)(result, signalRepository);
            didFetchNewSession = true;
        }
        return didFetchNewSession;
    };
    
 
    const sendPeerDataOperationMessage = async (pdoMessage) => {
        if (!authState.creds.me?.id) {
            throw new boom_1.Boom('Not authenticated')
        }
        
        const protocolMessage = {
            protocolMessage: {
                peerDataOperationRequestMessage: pdoMessage,
                type: WAProto_1.proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_MESSAGE
            }
        };
        const meJid = WABinary_1.jidNormalizedUser(authState.creds.me.id);
        const msgId = await relayMessage(meJid, protocolMessage, {
            additionalAttributes: {
                category: 'peer',
                // eslint-disable-next-line camelcase
                push_priority: 'high_force',
            },
        });
        return msgId;
    };
    const createParticipantNodes = async (jids, message, extraAttrs) => {
        const patched = await patchMessageBeforeSending(message, jids);
        const bytes = (0, Utils_1.encodeWAMessage)(patched);
        let shouldIncludeDeviceIdentity = false;
        const encryptForJid = async (jid) => {
            try {
                return await signalRepository.encryptMessage({ jid, data: bytes });
            }
            catch (error) {
                if (!isNoSessionError(error)) throw error;
                if (FAST_NO_SESSION_SKIP) {
                    logger?.debug?.({ jid }, 'Renvy ultra fast skipped device with missing signal session');
                    return null;
                }
                logger?.warn?.({ jid }, 'Renvy repaired missing signal session, refetching encryption keys');
                try {
                    await assertSessions([jid], true);
                    return await signalRepository.encryptMessage({ jid, data: bytes });
                }
                catch (retryError) {
                    if (!isNoSessionError(retryError)) throw retryError;
                    logger?.warn?.({ jid }, 'Renvy skipped device because signal session is still unavailable');
                    return null;
                }
            }
        };
        const nodes = (await Promise.all(jids.map(async (jid) => {
            const encrypted = await encryptForJid(jid);
            if (!encrypted) return null;
            const { type, ciphertext } = encrypted;
            if (type === 'pkmsg') {
                shouldIncludeDeviceIdentity = true;
            }
            const node = {
                tag: 'to',
                attrs: { jid },
                content: [{
                        tag: 'enc',
                        attrs: {
                            v: '2',
                            type,
                            ...extraAttrs || {}
                        },
                        content: ciphertext
                    }]
            };
            return node;
        }))).filter(Boolean);
        return { nodes, shouldIncludeDeviceIdentity };
    }; //apela
    const rawRelayMessage = async (jid, message, { messageId: msgId, participant, additionalAttributes, additionalNodes, useUserDevicesCache, cachedGroupMetadata: optionCachedGroupMetadata, useCachedGroupMetadata, statusJidList, AI = true } = {}) => {
        const meId = authState.creds.me.id;
        let shouldIncludeDeviceIdentity = false;
        let didPushAdditional = false
        const { user, server } = WABinary_1.jidDecode(jid);
        const statusJid = 'status@broadcast';
        const isGroup = server === 'g.us';
        const isStatus = jid === statusJid;
        const isLid = server === 'lid';
        const isPrivate = server === 's.whatsapp.net'
        const isNewsletter = server === 'newsletter';
        msgId = msgId || (0, Utils_1.generateMessageID)();
        if (isNewsletter && config.allowNewsletterSend !== true) {
            logger?.warn?.({ jid, msgId }, 'Renvy Bail blocked direct send to newsletter jid');
            return Types_1.WAProto.WebMessageInfo.fromObject({
                key: { remoteJid: jid, fromMe: true, id: msgId },
                message: Types_1.WAProto.Message.fromObject(message || {}),
                messageTimestamp: Utils_1.unixTimestampSeconds(new Date()),
                messageStubParameters: [],
                status: Types_1.WAMessageStatus.PENDING
            });
        }
        useUserDevicesCache = useUserDevicesCache !== false;
        useCachedGroupMetadata = useCachedGroupMetadata !== false && !isStatus
        // Renvy Bail v23: pilih getter metadata grup dari opsi sendMessage atau config socket.
        // Bug v22: variabel groupMetadataGetter dipakai tanpa definisi, sehingga reply grup crash.
        const groupMetadataGetter = typeof optionCachedGroupMetadata === 'function'
            ? optionCachedGroupMetadata
            : typeof cachedGroupMetadata === 'function'
                ? cachedGroupMetadata
                : null;
        const participants = [];
        const destinationJid = (!isStatus) ? WABinary_1.jidEncode(user, isLid ? 'lid' : isGroup ? 'g.us' : isNewsletter ? 'newsletter' : 's.whatsapp.net') : statusJid;
        const binaryNodeContent = [];
        const devices = [];
        const meMsg = {
            deviceSentMessage: {
                destinationJid,
                message
            }
        };
        const extraAttrs = {}
        const messages = Utils_1.normalizeMessageContent(message)  
        const isAIRichMessage = !!(
            messages?.richResponseMessage ||
            messages?.botForwardedMessage?.message?.richResponseMessage ||
            message?.richResponseMessage ||
            message?.botForwardedMessage?.message?.richResponseMessage
        );
        const buttonType = getButtonType(messages);
        if (participant) {
            // when the retry request is not for a group
            // only send to the specific device that asked for a retry
            // otherwise the message is sent out to every device that should be a recipient
            if (!isGroup && !isStatus) {
                additionalAttributes = { ...additionalAttributes, 'device_fanout': 'false' };
            }
            const { user, device } = WABinary_1.jidDecode(participant.jid);
            devices.push({ user, device });
        }
        await authState.keys.transaction(async () => {
            const mediaType = getMediaType(messages);
            
            if (mediaType) {
                extraAttrs['mediatype'] = mediaType
            }
            
            if (messages.pinInChatMessage || messages.keepInChatMessage || message.reactionMessage || message.protocolMessage?.editedMessage) {
                extraAttrs['decrypt-fail'] = 'hide'
            } 
            
            if (messages.interactiveResponseMessage?.nativeFlowResponseMessage) {
                extraAttrs['native_flow_name'] = messages.interactiveResponseMessage?.nativeFlowResponseMessage.name
            }
            
            if (isGroup || isStatus) {
                const [groupData, senderKeyMap] = await Promise.all([
                    (async () => {
                        let groupData

                        if (useCachedGroupMetadata && groupMetadataGetter) {
                            groupData = RENVY_FAST_GROUP_SEND
                                ? await quickValue(groupMetadataGetter(jid), RENVY_FAST_GROUP_CACHE_TIMEOUT)
                                : await groupMetadataGetter(jid)
                        }

                        if (groupData) {
                            logger.trace({ jid, participants: groupData.participants?.length || 0 }, 'using cached group metadata');
                        }

                        else if (!isStatus) {
                            if (RENVY_FAST_GROUP_SEND) {
                                // Jangan blokir reply command hanya untuk metadata grup.
                                // Metadata direfresh diam-diam supaya cache tetap kebentuk tanpa membuat bot slow respon.
                                if (RENVY_FAST_GROUP_BACKGROUND_REFRESH) {
                                    groupMetadata(jid).catch(error => logger?.trace?.({ jid, error: error?.message || String(error) }, 'Renvy background groupMetadata refresh skipped'));
                                }
                                groupData = makeMinimalGroupData(jid)
                            } else {
                                try {
                                    groupData = await groupMetadata(jid)
                                } catch (error) {
                                    if (isRateOverlimitError(error)) {
                                        logger?.warn?.({ jid }, 'rate-overlimit on groupMetadata, continuing with minimal group data');
                                        groupData = makeMinimalGroupData(jid)
                                    } else {
                                        throw error
                                    }
                                }
                            }
                        }
                        
                        return groupData;
                    })(),
                    (async () => {
                        if (!participant && !isStatus) {
                            const result = await authState.keys.get('sender-key-memory', [jid])
                            return result[jid] || {}
                        }

                        return {}

                    })()         
                ]);
                if (!participant) {
                    const participantsList = (groupData && !isStatus && Array.isArray(groupData.participants)) ? groupData.participants.map(p => p.id) : []

                    if (isStatus && statusJidList) {
                        participantsList.push(...statusJidList)
                    }

                    if (groupData?.ephemeralDuration && groupData.ephemeralDuration > 0) {
                        additionalAttributes = {
                            ...additionalAttributes,
                            expiration: groupData.ephemeralDuration.toString()
                        }
                    }

                    if (isGroup) {
                        additionalAttributes = {
                            ...additionalAttributes,
                            addressing_mode: groupData?.addressingMode || 'lid'
                        }
                    }

                    if (isGroup && !participantsList.length) {
                        throw new boom_1.Boom('Renvy safe group send blocked: missing group participants metadata', {
                            statusCode: 428,
                            data: { jid }
                        })
                    }

                 //   if (!isStatus) {
                 //       const expiration = await getEphemeralGroup(jid)
                 //       additionalAttributes = {
                 //           ...additionalAttributes, 
                 //           addressing_mode: 'pn',
                 //           ...expiration ? { expiration: expiration.toString() } : null
                 //       }
                 //   }

                    const additionalDevices = await getUSyncDevices(participantsList, !!useUserDevicesCache, false)
                    devices.push(...additionalDevices)
                }
                
                const patched = await patchMessageBeforeSending(message, devices.map(d => WABinary_1.jidEncode(d.user, isLid ? 'lid' : 's.whatsapp.net', d.device)));
                const bytes = Utils_1.encodeWAMessage(patched);
                
                const groupAddressingMode = additionalAttributes?.['addressing_mode'] || groupData?.addressingMode || 'lid';
                const groupSenderIdentity = groupAddressingMode === 'lid' && authState.creds.me?.lid ? authState.creds.me.lid : meId;
                const { ciphertext, senderKeyDistributionMessage } = await signalRepository.encryptGroupMessage({
                    group: destinationJid,
                    data: bytes,
                    meId: groupSenderIdentity,
                });
                const senderKeyJids = [];
                
                for (const { user, device } of devices) {
                    const jid = WABinary_1.jidEncode(user, (groupData === null || groupData === void 0 ? void 0 : groupData.addressingMode) === 'lid' ? 'lid' : 's.whatsapp.net', device);
                    if (!senderKeyMap[jid] || !!participant) {
                        senderKeyJids.push(jid);
                        // store that this person has had the sender keys sent to them
                        senderKeyMap[jid] = true;
                    }
                }
                // if there are some participants with whom the session has not been established
                // if there are, we re-send the senderkey
                if (senderKeyJids.length) {
                    logger.debug({ senderKeyJids }, 'sending new sender key');
                    const senderKeyMsg = {
                        senderKeyDistributionMessage: {
                            axolotlSenderKeyDistributionMessage: senderKeyDistributionMessage,
                            groupId: destinationJid
                        }
                    };
                    await assertSessions(senderKeyJids, false);
                    const result = await createParticipantNodes(senderKeyJids, senderKeyMsg, extraAttrs)
                    if (!result.nodes.length) {
                        throw new boom_1.Boom('Renvy safe group send blocked: sender-key distribution failed', {
                            statusCode: 428,
                            data: { jid, senderKeyJids }
                        })
                    }
                    shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || result.shouldIncludeDeviceIdentity;
                    participants.push(...result.nodes);
                }
                binaryNodeContent.push({
                    tag: 'enc',
                    attrs: { v: '2', type: 'skmsg', ...extraAttrs },
                    content: ciphertext
                });
                await authState.keys.set({ 'sender-key-memory': { [jid]: senderKeyMap } });
            }
            else if (isNewsletter) {
                // Message edit
                if (message.protocolMessage?.editedMessage) {
                    msgId = message.protocolMessage.key?.id
                    message = message.protocolMessage.editedMessage
                }

                // Message delete
                if (message.protocolMessage?.type === WAProto_1.proto.Message.ProtocolMessage.Type.REVOKE) {
                    msgId = message.protocolMessage.key?.id
                    message = {}
                }

                const patched = await patchMessageBeforeSending(message, [])
                const bytes = Utils_1.encodeNewsletterMessage(patched)

                binaryNodeContent.push({
                    tag: 'plaintext',
                    attrs: extraAttrs ? extraAttrs : {},
                    content: bytes
                })
            }
            else {
                const { user: meUser } = WABinary_1.jidDecode(meId);
                if (!participant) {
                    devices.push({ user })
                    if (user !== meUser) {
                        devices.push({ user: meUser })
                    }

                    if (additionalAttributes?.['category'] !== 'peer') {
                        const senderIdentity = isLid && authState.creds.me?.lid
                            ? WABinary_1.jidEncode(WABinary_1.jidDecode(authState.creds.me.lid)?.user, 'lid')
                            : WABinary_1.jidEncode(WABinary_1.jidDecode(meId)?.user, 's.whatsapp.net')
                        const additionalDevices = await getUSyncDevices([senderIdentity, jid], !!useUserDevicesCache, false)

                        devices.push(...additionalDevices)
                    }
                }
                const allJids = [];
                const meJids = [];
                const otherJids = [];
                for (const { user, device } of devices) {
                    const isMe = user === meUser
                    const jid = WABinary_1.jidEncode(isMe && isLid ? authState.creds?.me?.lid?.split(':')[0] || user : user, isLid ? 'lid' : 's.whatsapp.net', device)

                    if (isMe) {
                        meJids.push(jid)
                    }

                    else {
                        otherJids.push(jid)
                    }

                    allJids.push(jid)
                }
                await assertSessions(allJids, false);
                const [{ nodes: meNodes, shouldIncludeDeviceIdentity: s1 }, { nodes: otherNodes, shouldIncludeDeviceIdentity: s2 }] = await Promise.all([
                    createParticipantNodes(meJids, meMsg, extraAttrs),
                    createParticipantNodes(otherJids, message, extraAttrs)
                ])
                if (otherJids.length && !otherNodes.length) {
                    throw new boom_1.Boom('SessionError: No sessions', { statusCode: 428, data: { jid, otherJids } });
                }
                participants.push(...meNodes);
                participants.push(...otherNodes);
                shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || s1 || s2;
            }
            if (participants.length) {
                if (additionalAttributes?.['category'] === 'peer') {
                    const peerNode = participants[0]?.content?.[0]

                    if (peerNode) {
                        binaryNodeContent.push(peerNode) // push only enc
                    }
                }

                else {
                    binaryNodeContent.push({
                        tag: 'participants',
                        attrs: {},
                        content: participants
                    })
                }
            }

            const stanza = {
                tag: 'message',
                attrs: {
                    id: msgId,
                    type: getTypeMessage(messages), 
                    ...(additionalAttributes || {})
                },
                content: binaryNodeContent
            }
            // if the participant to send to is explicitly specified (generally retry recp)
            // ensure the message is only sent to that person
            // if a retry receipt is sent to everyone -- it'll fail decryption for everyone else who received the msg
            if (participant) {
                if (WABinary_1.isJidGroup(destinationJid)) {
                    stanza.attrs.to = destinationJid;
                    stanza.attrs.participant = participant.jid;
                }
                else if (WABinary_1.areJidsSameUser(participant.jid, meId)) {
                    stanza.attrs.to = participant.jid;
                    stanza.attrs.recipient = destinationJid;
                }
                else {
                    stanza.attrs.to = participant.jid;
                }
            }
            else {
                stanza.attrs.to = destinationJid;
            }
            if (shouldIncludeDeviceIdentity) {
                stanza.content.push({
                    tag: 'device-identity',
                    attrs: {},
                    content: (0, Utils_1.encodeSignedDeviceIdentity)(authState.creds.account, true)
                });
                logger.debug({ jid }, 'adding device identity');
            }
     
            if (AI && isPrivate && !isAIRichMessage) {
                const botNode = {
                    tag: 'bot', 
                    attrs: {
                        biz_bot: '1'
                    }
                }

                const filteredBizBot = WABinary_1.getBinaryNodeFilter(additionalNodes ? additionalNodes : []) 

                if (filteredBizBot) {
                    stanza.content.push(...additionalNodes) 
                    didPushAdditional = true
                }

                else {
                    stanza.content.push(botNode) 
                }
            }
            
            if(!isNewsletter && buttonType && !isStatus) {             
                const content = WABinary_1.getAdditionalNode(buttonType)
                const filteredNode = WABinary_1.getBinaryNodeFilter(additionalNodes)

                if (filteredNode) {
                    didPushAdditional = true
                    stanza.content.push(...additionalNodes)
                } 
                else {
                    stanza.content.push(...content)
                }
                logger.debug({ jid }, 'adding business node')
            }         

            if (!didPushAdditional && additionalNodes && additionalNodes.length > 0) {
                stanza.content.push(...additionalNodes);
            }
            
            logger.debug({ msgId }, `sending message to ${participants.length} devices`);
            await sendNode(stanza);
        });
        
        message = Types_1.WAProto.Message.fromObject(message)
    
        const messageJSON = {
            key: {
               remoteJid: jid,
               fromMe: true,
               id: msgId
            },
            message: message,
            messageTimestamp: Utils_1.unixTimestampSeconds(new Date()),
            messageStubParameters: [],
            participant: WABinary_1.isJidGroup(jid) || WABinary_1.isJidStatusBroadcast(jid) ? meId : undefined,
            status: Types_1.WAMessageStatus.PENDING
        }

        return Types_1.WAProto.WebMessageInfo.fromObject(messageJSON)
     //   return msgId;
    };
    const relayMessage = async (jid, message, options = {}) => {
        const safeOptions = { ...(options || {}) };
        if (!safeOptions.messageId) safeOptions.messageId = (0, Utils_1.generateMessageID)();
        try {
            const result = await runQueuedSend(
                () => withSendRetry(() => rawRelayMessage(jid, message, safeOptions), { jid, type: 'relayMessage' }),
                { jid, type: 'relayMessage' }
            );
            if (messageRetryManager && !safeOptions.participant && safeOptions.messageId && message) {
                messageRetryManager.addRecentMessage(jid, safeOptions.messageId, message);
            }
            return result;
        } catch (error) {
            if (RENVY_ANTI_CRASH && isRetryableSendError(error)) {
                logger?.warn?.({ jid, msgId: safeOptions.messageId, error: error?.message || String(error) }, 'Renvy anti-crash handled relayMessage error');
                return makeSafeSentMessage(jid, message, safeOptions.messageId);
            }
            throw error;
        }
    };
    const getTypeMessage = (msg) => {
            const message = Utils_1.normalizeMessageContent(msg)  
        if (message.reactionMessage) {
            return 'reaction'
        }       
        else if (getMediaType(message)) {
            return 'media'
        }        
        else {
            return 'text'
        }
    }

    const getMediaType = (message) => {
        if (message.imageMessage) {
            return 'image'
        }
        else if (message.videoMessage) {
            return message.videoMessage.gifPlayback ? 'gif' : 'video'
        }
        else if (message.audioMessage) {
            return message.audioMessage.ptt ? 'ptt' : 'audio'
        }
        else if (message.contactMessage) {
            return 'vcard'
        }
        else if (message.documentMessage) {
            return 'document'
        }
        else if (message.contactsArrayMessage) {
            return 'contact_array'
        }
        else if (message.liveLocationMessage) {
            return 'livelocation'
        }
        else if (message.stickerMessage) {
            return 'sticker'
        }
        else if (message.listMessage) {
            return 'list'
        }
        else if (message.listResponseMessage) {
            return 'list_response'
        }
        else if (message.buttonsResponseMessage) {
            return 'buttons_response'
        }
        else if (message.orderMessage) {
            return 'order'
        }
        else if (message.productMessage) {
            return 'product'
        }
        else if (message.interactiveResponseMessage) {
            return 'native_flow_response'
        }
        else if (message.groupInviteMessage) {
            return 'url'
        }
        else if (/https:\/\/wa\.me\/p\/\d+\/\d+/.test(message.extendedTextMessage?.text)) {
            return 'productlink'
        }
    }
 
    const getButtonType = (message) => {
        if (message.listMessage) {
            return 'list'
        }
        else if (message.buttonsMessage) {
            return 'buttons'
        }
        else if (message.interactiveMessage?.nativeFlowMessage?.buttons?.[0]?.name === 'review_and_pay') {
            return 'review_and_pay'
        }
        else if (message.interactiveMessage?.nativeFlowMessage?.buttons?.[0]?.name === 'review_order') {
            return 'review_order'
        }
        else if (message.interactiveMessage?.nativeFlowMessage?.buttons?.[0]?.name === 'payment_info') {
            return 'payment_info'
        }
        else if (message.interactiveMessage?.nativeFlowMessage?.buttons?.[0]?.name === 'payment_status') {
            return 'payment_status'
        }
        else if (message.interactiveMessage?.nativeFlowMessage?.buttons?.[0]?.name === 'payment_method') {
            return 'payment_method'
        }
        else if (message.interactiveMessage && message.interactiveMessage?.nativeFlowMessage) {
            return 'interactive'
        }
        else if (message.interactiveMessage?.nativeFlowMessage) {
            return 'native_flow'
        }
    }
    const getPrivacyTokens = async (jids) => {
        const t = Utils_1.unixTimestampSeconds().toString();
        const result = await query({
            tag: 'iq',
            attrs: {
                to: WABinary_1.S_WHATSAPP_NET,
                type: 'set',
                xmlns: 'privacy'
            },
            content: [
                {
                    tag: 'tokens',
                    attrs: {},
                    content: jids.map(jid => ({
                        tag: 'token',
                        attrs: {
                            jid: WABinary_1.jidNormalizedUser(jid),
                            t,
                            type: 'trusted_contact'
                        }
                    }))
                }
            ]
        });
        return result;
    }  
    const waUploadToServer = (0, Utils_1.getWAUploadToServer)(config, refreshMediaConn);
    const rahmi = new kikyy(Utils_1, waUploadToServer, relayMessage);
    const waitForMsgMediaUpdate = (0, Utils_1.bindWaitForEvent)(ev, 'messages.media-update');
    return {
        ...sock,
        getPrivacyTokens,
        getLIDForPN,
        getPNForLID,
        assertSessions,
        relayMessage,
        sendReceipt,
        sendReceipts,
        rahmi,
        readMessages,
        refreshMediaConn,
        getUSyncDevices,
        createParticipantNodes,
        waUploadToServer,
        sendPeerDataOperationMessage,
        fetchPrivacySettings,
        messageRetryManager,
        updateMediaMessage: async (message) => {
            const content = (0, Utils_1.assertMediaContent)(message.message);
            const mediaKey = content.mediaKey;
            const meId = authState.creds.me.id;
            const node = (0, Utils_1.encryptMediaRetryRequest)(message.key, mediaKey, meId);
            let error = undefined;
            await Promise.all([
                sendNode(node),
                waitForMsgMediaUpdate(update => {
                    const result = update.find(c => c.key.id === message.key.id);
                    if (result) {
                        if (result.error) {
                            error = result.error;
                        }
                        else {
                            try {
                                const media = (0, Utils_1.decryptMediaRetryData)(result.media, mediaKey, result.key.id);
                                if (media.result !== WAProto_1.proto.MediaRetryNotification.ResultType.SUCCESS) {
                                    const resultStr = WAProto_1.proto.MediaRetryNotification.ResultType[media.result];
                                    throw new boom_1.Boom(`Media re-upload failed by device (${resultStr})`, { data: media, statusCode: (0, Utils_1.getStatusCodeForMediaRetry)(media.result) || 404 });
                                }
                                content.directPath = media.directPath;
                                content.url = (0, Utils_1.getUrlFromDirectPath)(content.directPath);
                                logger.debug({ directPath: media.directPath, key: result.key }, 'media update successful');
                            }
                            catch (err) {
                                error = err;
                            }
                        }
                        return true;
                    }
                })
            ]);
            if (error) {
                throw error;
            }
            ev.emit('messages.update', [
                {
                    key: message.key,
                    update: { 
                        message: message.message
                    }
                }
            ]);
            return message;
        },
        sendMessage: safeSocketCall('sendMessage', async (jid, content, options = {}) => {
            const userJid = authState.creds.me.id;
            delete options.ephemeralExpiration
            const { filter = false, quoted } = options;
            const getParticipantAttr = () => filter ? { participant: { jid } } : {};
            const messageType = rahmi.detectType(content);
            if (typeof content === 'object' && 'disappearingMessagesInChat' in content &&
                typeof content['disappearingMessagesInChat'] !== 'undefined' && WABinary_1.isJidGroup(jid)) {
                const { disappearingMessagesInChat } = content

                const value = typeof disappearingMessagesInChat === 'boolean' ?
                    (disappearingMessagesInChat ? Defaults_1.WA_DEFAULT_EPHEMERAL : 0) :
                    disappearingMessagesInChat

                await groupToggleEphemeral(jid, value)
            }
            
            else {
                let mediaHandle

   
            if (messageType) {
                switch(messageType) {
                    case 'PAYMENT':
                        const paymentContent = await rahmi.handlePayment(content, quoted);
                        return await relayMessage(jid, paymentContent, {
                            messageId: Utils_1.generateMessageID(),
                            ...getParticipantAttr()
                        });
                
                    case 'PRODUCT':
                        const productContent = await rahmi.handleProduct(content, jid, quoted);
                        const productMsg = await Utils_1.generateWAMessageFromContent(jid, productContent, { quoted });
                        return await relayMessage(jid, productMsg.message, {
                            messageId: productMsg.key.id,
                            ...getParticipantAttr()
                        });
                
                    case 'INTERACTIVE':
                        const interactiveContent = await rahmi.handleInteractive(content, jid, quoted);
                        const interactiveMsg = await Utils_1.generateWAMessageFromContent(jid, interactiveContent, { quoted });
                        return await relayMessage(jid, interactiveMsg.message, {
                            messageId: interactiveMsg.key.id,
                            ...getParticipantAttr()
                        });
                    case 'ALBUM':
                        return await rahmi.handleAlbum(content, jid, quoted)
                    case 'EVENT':
                        return await rahmi.handleEvent(content, jid, quoted)
                    case 'POLL_RESULT':
                        return await rahmi.handlePollResult(content, jid, quoted)
                    case 'GROUP_STORY':
                        return await rahmi.handleGroupStory(content, jid, quoted)
                }
            }
            const fullMsg = await Utils_1.generateWAMessage(jid, content, {
                logger,
                userJid,
                quoted,
                getUrlInfo: text => link_preview_1.getUrlInfo(text, {
                    thumbnailWidth: linkPreviewImageThumbnailWidth,
                    fetchOpts: {
                        timeout: 3000,
                        ...axiosOptions || {}
                    },
                    logger,
                    uploadImage: generateHighQualityLinkPreview ? waUploadToServer : undefined
                }),
                upload: async (readStream, opts) => {
                    const up = await waUploadToServer(readStream, {
                        ...opts,
                        newsletter: WABinary_1.isJidNewsLetter(jid)
                    });
                    return up;
                },
                mediaCache: config.mediaCache,
                options: config.options,
                ...options
            });
            
            const isDeleteMsg = 'delete' in content && !!content.delete;
            const isEditMsg = 'edit' in content && !!content.edit;
            const isAiMsg = 'ai' in content && !!content.ai;
            
            const additionalAttributes = {};
            const additionalNodes = [];

            if (isDeleteMsg) {
                const fromMe = content.delete?.fromMe;
                const isGroup = WABinary_1.isJidGroup(content.delete?.remoteJid);
                additionalAttributes.edit = (isGroup && !fromMe) || WABinary_1.isJidNewsLetter(jid) ? '8' : '7';
            } else if (isEditMsg) {
                additionalAttributes.edit = WABinary_1.isJidNewsLetter(jid) ? '3' : '1';
            } else if (isAiMsg) {
                additionalNodes.push({
                    attrs: { 
                        biz_bot: '1' 
                    }, tag: "bot" 
                });
            }
            
            await relayMessage(jid, fullMsg.message, {
                messageId: fullMsg.key.id,
                cachedGroupMetadata: options.cachedGroupMetadata,
                additionalNodes: isAiMsg ? additionalNodes : options.additionalNodes,
                additionalAttributes,
                statusJidList: options.statusJidList
            });
            
            if (config.emitOwnEvents) {
                process.nextTick(() => {
                    processingMutex.mutex(() => upsertMessage(fullMsg, 'append'));
                });
            }
            return fullMsg;
            }
        })
    }
};
exports.makeMessagesSocket = makeMessagesSocket;
