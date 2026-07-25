/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

let compoundsMap: Record<string, string> = {};
let compoundsReady = false;
const readyCallbacks: Array<() => void> = [];

export function onCompoundsReady(cb: () => void) {
    if (compoundsReady) { cb(); return; }
    readyCallbacks.push(cb);
}

export async function loadCompounds(url: string) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        compoundsMap = await res.json();
        compoundsReady = true;
        readyCallbacks.splice(0).forEach(cb => cb());
    } catch (e) {
        console.error("[FuriganaCord] Failed to load compounds:", e);
        setTimeout(() => loadCompounds(url), 30_000);
    }
}

export function lookupCompound(text: string, pos: number): { match: string; reading: string; } | null {
    let best: { match: string; reading: string; } | null = null;
    let candidate = "";
    for (let i = pos; i < text.length; i++) {
        candidate += text[i];
        const reading = compoundsMap[candidate];
        if (reading) best = { match: candidate, reading };
    }
    return best;
}
