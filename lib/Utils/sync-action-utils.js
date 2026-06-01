"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitSyncActionResults = exports.processContactAction = void 0;
const WABinary_1 = require("../WABinary");
/**
 * Process contactAction from app-state sync and return events to emit.
 * This keeps PN/LID mapping updates isolated and safe for older Renvy flows.
 */
const processContactAction = (action, id, logger) => {
    const results = [];
    if (!id) {
        logger?.warn?.({ hasFullName: !!action?.fullName, hasLidJid: !!action?.lidJid, hasPnJid: !!action?.pnJid }, 'contactAction sync: missing id in index');
        return results;
    }
    const lidJid = action?.lidJid;
    const idIsPn = typeof WABinary_1.isPnUser === 'function'
        ? (0, WABinary_1.isPnUser)(id)
        : String(id).endsWith('@s.whatsapp.net');
    const lidIsValid = typeof WABinary_1.isLidUser === 'function'
        ? (lidJid && (0, WABinary_1.isLidUser)(lidJid))
        : (lidJid && String(lidJid).endsWith('@lid'));
    const phoneNumber = idIsPn ? id : action?.pnJid || undefined;
    results.push({
        event: 'contacts.upsert',
        data: [
            {
                id,
                name: action?.fullName || action?.firstName || action?.username || undefined,
                username: action?.username || undefined,
                lid: lidJid || undefined,
                phoneNumber
            }
        ]
    });
    if (lidJid && lidIsValid && idIsPn) {
        results.push({
            event: 'lid-mapping.update',
            data: { lid: lidJid, pn: id }
        });
    }
    return results;
};
exports.processContactAction = processContactAction;
const emitSyncActionResults = (ev, results) => {
    for (const result of results || []) {
        if (result.event === 'contacts.upsert') {
            ev.emit('contacts.upsert', result.data);
        }
        else if (result.event === 'lid-mapping.update') {
            ev.emit('lid-mapping.update', result.data);
        }
    }
};
exports.emitSyncActionResults = emitSyncActionResults;
