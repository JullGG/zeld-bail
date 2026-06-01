"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAckStanza = void 0;
/**
 * Builds an ACK/NACK stanza for a received WhatsApp node.
 * Ported from Baileys rc13 style and kept CommonJS-safe for Renvy Bail.
 */
function buildAckStanza(node, errorCode, meId) {
    const { tag, attrs } = node;
    const stanza = {
        tag: 'ack',
        attrs: {
            id: attrs.id,
            to: attrs.from,
            class: tag
        }
    };
    if (typeof errorCode !== 'undefined' && errorCode !== null) {
        stanza.attrs.error = errorCode.toString();
    }
    if (attrs.participant) {
        stanza.attrs.participant = attrs.participant;
    }
    if (attrs.recipient) {
        stanza.attrs.recipient = attrs.recipient;
    }
    if (attrs.type) {
        stanza.attrs.type = attrs.type;
    }
    if (tag === 'message' && meId) {
        stanza.attrs.from = meId;
    }
    return stanza;
}
exports.buildAckStanza = buildAckStanza;
