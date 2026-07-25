/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Source: scriptin/jmdict-simplified (kanjidic2-en)

import { toRomaji } from "./kana";

export interface KanjiInfo {
    on: string[];
    kun: string[];
    meanings: string[];
}

interface KanjiDataEntry {
    o?: string[];
    k?: string[];
    m?: string[];
}

let kanjiDict: Record<string, KanjiDataEntry> = {};
let isDictReady = false;
const readyCallbacks: Array<() => void> = [];

export function onReady(cb: () => void) {
    if (isDictReady) { cb(); return; }
    readyCallbacks.push(cb);
}

export async function loadDict(url: string) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        kanjiDict = await res.json();
        isDictReady = true;
        readyCallbacks.splice(0).forEach(cb => cb());
    } catch (e) {
        console.error("[FuriganaCord] Failed to load kanji dict:", e);
        setTimeout(() => loadDict(url), 30_000);
    }
}

let nameOverrides: Record<string, string> = {
    "天道 剣": "Tendou Tsurugi",
    "芽森": "Me Mori",
};

export function setNameOverrides(data: Record<string, string>) {
    nameOverrides = data;
}

export function lookupNameOverride(text: string, pos: number): { name: string; reading: string; } | null {
    const remaining = text.slice(pos);
    for (const [name, reading] of Object.entries(nameOverrides)) {
        if (remaining.startsWith(name)) {
            return { name, reading };
        }
    }
    return null;
}

export function stripOkurigana(reading: string): string {
    const dot = reading.lastIndexOf(".");
    const dotStripped = dot >= 0 ? reading.slice(0, dot) : reading;

    if (dotStripped.startsWith("-")) {
        return dotStripped.slice(1);
    }
    if (dotStripped.endsWith("-")) {
        return dotStripped.slice(0, -1);
    }
    return dotStripped;
}

function extractStem(reading: string): string {
    const dot = reading.indexOf(".");
    if (dot >= 0) {
        let stem = reading.slice(0, dot);
        if (stem.startsWith("-")) stem = stem.slice(1);
        return stem;
    }
    let result = reading;
    if (result.startsWith("-")) result = result.slice(1);
    if (result.endsWith("-")) result = result.slice(0, -1);
    return result;
}

function matchesOkurigana(entry: string, okurigana: string): boolean {
    const dot = entry.lastIndexOf(".");
    if (dot >= 0) {
        return entry.slice(dot + 1) === okurigana;
    }
    const stripped = entry.startsWith("-") ? entry.slice(1) : entry;
    const trailing = stripped.endsWith("-") ? stripped.slice(0, -1) : "";
    return trailing.length > 0 && okurigana.startsWith(trailing);
}

export function lookupKanji(char: string): KanjiInfo | undefined {
    const entry = kanjiDict[char];
    if (!entry) return undefined;
    return {
        on: entry.o || [],
        kun: entry.k || [],
        meanings: entry.m || [],
    };
}

export function getRawKanjiEntry(char: string): KanjiDataEntry | undefined {
    return kanjiDict[char];
}

export function getKanjiKanaReading(char: string, preference: "kun" | "on" = "kun", okurigana?: string): string {
    const raw = kanjiDict[char];
    if (!raw) return "";
    const info = { o: raw.o || [], k: raw.k || [] };

    if (preference === "on") {
        if (info.o.length > 0) return info.o[0];
        if (info.k.length > 0) return stripOkurigana(info.k[0]);
    } else {
        if (info.k.length > 0) {
            if (okurigana) {
                for (let len = okurigana.length; len >= 1; len--) {
                    const candidate = okurigana.slice(0, len);
                    const matched = info.k.find(r => matchesOkurigana(r, candidate));
                    if (matched) return extractStem(matched);
                }
            }
            return stripOkurigana(info.k[0]);
        }
        if (info.o.length > 0) return info.o[0];
    }
    return "";
}

export function getKanjiReading(char: string, preference: "kun" | "on" = "kun", okurigana?: string): string {
    const raw = kanjiDict[char];
    if (!raw) return "";
    const info = { o: raw.o || [], k: raw.k || [] };

    if (preference === "on") {
        if (info.o.length > 0) return toRomaji(info.o[0]);
        if (info.k.length > 0) return toRomaji(stripOkurigana(info.k[0]));
    } else {
        if (info.k.length > 0) {
            if (okurigana) {
                for (let len = okurigana.length; len >= 1; len--) {
                    const candidate = okurigana.slice(0, len);
                    const matched = info.k.find(r => matchesOkurigana(r, candidate));
                    if (matched) return toRomaji(extractStem(matched));
                }
            }
            return toRomaji(stripOkurigana(info.k[0]));
        }
        if (info.o.length > 0) return toRomaji(info.o[0]);
    }

    return "";
}
