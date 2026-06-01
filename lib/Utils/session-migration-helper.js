"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateSessionKeys = exports.buildSessionMigrationPlan = void 0;
/**
 * Build a safe migration plan for old Signal session ids.
 * Does not mutate by itself; use migrateSessionKeys() to apply.
 */
function buildSessionMigrationPlan(sessions, resolver) {
    const plan = [];
    for (const oldId of Object.keys(sessions || {})) {
        const value = sessions[oldId];
        if (!value) continue;
        const nextId = resolver(oldId);
        if (nextId && nextId !== oldId && !sessions[nextId]) {
            plan.push({ from: oldId, to: nextId });
        }
    }
    return plan;
}
exports.buildSessionMigrationPlan = buildSessionMigrationPlan;
async function migrateSessionKeys(keys, plan, logger) {
    if (!plan || !plan.length) return { migrated: 0 };
    const oldIds = plan.map(item => item.from);
    const existing = await keys.get('session', oldIds);
    const updates = {};
    let migrated = 0;
    for (const item of plan) {
        if (existing[item.from]) {
            updates[item.to] = existing[item.from];
            updates[item.from] = null;
            migrated++;
        }
    }
    if (migrated > 0) {
        await keys.set({ session: updates });
        logger?.info?.({ migrated }, 'Renvy migrated legacy Signal sessions');
    }
    return { migrated };
}
exports.migrateSessionKeys = migrateSessionKeys;
