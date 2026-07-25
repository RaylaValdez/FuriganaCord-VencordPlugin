/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { lookupCompound } from "./compounds";
import { matchConjugation } from "./conjugation";
import { toRomaji } from "./kana";
import { getKanjiKanaReading, getKanjiReading, lookupKanji, lookupNameOverride, stripOkurigana } from "./kanji";

const japaneseRegex = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const kanaRegex = /[\u3040-\u30ff]/;
const hiraganaRegex = /[\u3040-\u309f]/;
const smallKanaRegex = /[ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ]/;
const kanjiRegex = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

const charOverrides: Record<string, string> = {
    "\u3092": "o",
};

const forceOnKanji = new Set(["\u50E5", "\u56F3", "\u6C17", "\u672C"]);

const suffixKanji = new Set(["\u541B", "\u69D8", "\u6BBF", "\u6C0F"]);

const suffixPatterns = new Set([
    "\u8005", "\u5BB6", "\u6027", "\u5316", "\u7684", "\u90E8", "\u79D1", "\u5BA4", "\u5C40",
    "\u7701", "\u5E02", "\u753A", "\u6751", "\u56FD", "\u8A9E", "\u5B66", "\u6CD5", "\u529B",
    "\u611F", "\u7387", "\u5EA6", "\u91CF", "\u5F62", "\u7DDA", "\u70B9", "\u9762", "\u4F53",
    "\u7528", "\u4EF6", "\u56DE", "\u6B21", "\u524D", "\u5F8C", "\u4E0A", "\u4E0B", "\u4E2D",
    "\u5185", "\u5916", "\u9593", "\u6240", "\u5834", "\u6642", "\u5E74", "\u6708", "\u65E5",
    "\u4EBA", "\u7269", "\u4E8B", "\u65B9", "\u54E1", "\u6B74", "\u53F2", "\u6587", "\u737B",
    "\u7406", "\u5DE5", "\u533B", "\u8535", "\u8FB2", "\u5546", "\u7D4C", "\u653F", "\u6CD5",
    "\u6559", "\u8ECD", "\u82B8", "\u8853", "\u97F3", "\u697D", "\u753B", "\u6620", "\u5199",
    "\u771F", "\u6280", "\u8853", "\u6A5F", "\u68B0", "\u96FB", "\u5B50", "\u60C5\u5831",
    "\u901A\u4FE1", "\u8A08\u7B97", "\u51E6\u7406", "\u7BA1\u7406", "\u904B\u55B1",
    "\u88FD\u4F5C", "\u958B\u767A", "\u7814\u7A76", "\u8ABF\u67FB", "\u5206\u6790",
    "\u8A2D\u8A08", "\u751F\u7523", "\u88FD\u9020", "\u8CA9\u58F2", "\u30B5\u30FC\u30D3\u30B9",
]);

const particleSet = new Set([
    "\u306F", "\u304C", "\u3092", "\u306B", "\u3067", "\u3078", "\u306E", "\u3082",
    "\u3068", "\u3084", "\u304B", "\u306D", "\u3088", "\u306A", "\u305E", "\u305C",
    "\u308F", "\u3055",
]);

const compoundReadings: Record<string, string> = {
    "\u9811\u5F35": "\u3070",
    "\u624B\u4F1D": "\u3064\u3060",
    "\u53CB\u9054": "\u3060\u3061",
};

function isPrevKanji(jpBlock: string, pos: number): boolean {
    if (pos <= 0) return false;
    const prev = jpBlock[pos - 1];
    return kanjiRegex.test(prev);
}

export function containsJapanese(text: string): boolean {
    return japaneseRegex.test(text);
}

function isSmallKana(char: string): boolean {
    return smallKanaRegex.test(char);
}

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function renderCompoundHtml(matchText: string, reading: string): string {
    let inner = "";
    for (const ch of matchText) {
        if (kanjiRegex.test(ch)) {
            inner += `<ruby data-kanji="${ch}">${ch}</ruby>`;
        } else {
            inner += escapeHtml(ch);
        }
    }
    return "<span style=\"display:inline-flex;flex-direction:column;align-items:center;vertical-align:top;line-height:1.3\">" +
        `<span>${inner}</span>` +
        `<span style="font-size:var(--jp-ruby-font-size,0.75em);line-height:1.1;opacity:0.65;display:block;text-align:center;letter-spacing:0">${reading}</span></span>`;
}

function renderKanjiRuby(char: string, kanaReading: string, romajiReading: string, showFurigana: boolean, showRomaji = true): string {
    if (showFurigana && showRomaji && kanaReading) {
        return `<ruby data-kanji="${char}"><ruby>${char}<rt>${kanaReading}</rt></ruby><rt>${romajiReading}</rt></ruby>`;
    }
    if (showFurigana && kanaReading) {
        return `<ruby data-kanji="${char}" data-furigana="true">${char}<rt>${kanaReading}</rt></ruby>`;
    }
    if (showRomaji) {
        return `<ruby data-kanji="${char}">${char}<rt>${romajiReading}</rt></ruby>`;
    }
    return escapeHtml(char);
}

function getCharReadingWithContext(char: string, nextChar: string, isLastInBlock: boolean, prevChar: string): string {
    if (charOverrides[char]) return charOverrides[char];

    if (char === "\u306F") {
        if (isLastInBlock) return "wa";
        if (isPrevKanji("\u306F", 1) && !hiraganaRegex.test(nextChar)) return "wa";
        if (isPrevKanji("\u306F", 1) && nextChar && (nextChar === "\u306B" || nextChar === "\u3068" || nextChar === "\u3084" || nextChar === "\u3060" || nextChar === "\u3088" || nextChar === "\u306D" || nextChar === "\u305E" || nextChar === "\u305C" || nextChar === "\u308F" || nextChar === "\u3055" || nextChar === "\u306A" || nextChar === "\u3088")) return "wa";
        return "ha";
    }
    if (char === "\u3078") {
        if (isLastInBlock) return "e";
        if (isPrevKanji("\u3078", 1)) return "e";
        return "he";
    }

    if (char === "\u3063" || char === "\u30C3") {
        if (!nextChar || !kanaRegex.test(nextChar)) return "\u3063";
        const nextReading = toRomaji(nextChar);
        return nextReading ? nextReading[0] : "\u3063";
    }

    const reading = toRomaji(char);
    return reading || char;
}

export interface RenderOptions {
    furiganaNotation?: boolean;
    romajiNotation?: boolean;
    readingPreference?: "kun" | "on";
}

function determineReadingPreference(char: string, jpBlock: string, pos: number, userPref: "kun" | "on"): "kun" | "on" {
    if (forceOnKanji.has(char)) return "on";

    const next = pos + 1 < jpBlock.length ? jpBlock[pos + 1] : "";
    if (next && hiraganaRegex.test(next) && !particleSet.has(next)) {
        return "kun";
    }

    if (suffixPatterns.has(char) && pos > 0) {
        return "on";
    }

    if (pos > 0 && kanjiRegex.test(jpBlock[pos - 1])) {
        return "on";
    }

    return userPref;
}

export function renderRubyText(text: string, options: RenderOptions = {}): string {
    const {
        furiganaNotation = true,
        romajiNotation = true,
        readingPreference = "kun",
    } = options;

    let result = "";
    let i = 0;

    while (i < text.length) {
        const char = text[i];

        if (japaneseRegex.test(char)) {
            const nameMatch = lookupNameOverride(text, i);
            if (nameMatch) {
                if (!romajiNotation && !furiganaNotation) {
                    result += escapeHtml(nameMatch.name);
                } else {
                    result += renderCompoundHtml(nameMatch.name, nameMatch.reading);
                }
                i += nameMatch.name.length;
                continue;
            }

            const jpStart = i;
            while (i < text.length && japaneseRegex.test(text[i])) {
                if (i + 1 < text.length && isSmallKana(text[i + 1])) {
                    i += 2;
                } else {
                    i += 1;
                }
            }
            const jpBlock = text.slice(jpStart, i);
            const isLast = i >= text.length || !japaneseRegex.test(text[i]);

            for (let j = 0; j < jpBlock.length; j++) {
                const c = jpBlock[j];
                const next = j + 1 < jpBlock.length ? jpBlock[j + 1] : "";
                const prev = j > 0 ? jpBlock[j - 1] : "";
                const isLastInBlock = j === jpBlock.length - 1 && isLast;

                if (j + 1 < jpBlock.length && isSmallKana(jpBlock[j + 1])) {
                    const digraph = c + jpBlock[j + 1];
                    if (romajiNotation) {
                        const reading = toRomaji(digraph);
                        result += reading && reading !== digraph
                            ? `<ruby>${digraph}<rt>${reading}</rt></ruby>`
                            : escapeHtml(digraph);
                    } else {
                        result += escapeHtml(digraph);
                    }
                    j++;
                } else if (kanaRegex.test(c)) {
                    if (romajiNotation) {
                        const reading = getCharReadingWithContext(c, next, isLastInBlock, prev);
                        result += reading !== c
                            ? `<ruby>${c}<rt>${reading}</rt></ruby> `
                            : escapeHtml(c);
                    } else {
                        result += escapeHtml(c);
                    }
                } else {
                    if (romajiNotation) {
                        const compound = lookupCompound(jpBlock, j);
                        if (compound) {
                            const perCharReadings: string[] = [];
                            let remaining = compound.reading;
                            let canSplit = true;
                            for (let ci = 0; ci < compound.match.length; ci++) {
                                const ch = compound.match[ci];
                                const candidates: string[] = [];
                                if (kanjiRegex.test(ch)) {
                                    if (ci > 0) {
                                        const pairKana = compoundReadings[compound.match[ci - 1] + ch];
                                        if (pairKana) candidates.push(toRomaji(pairKana));
                                    }
                                    const dictEntry = lookupKanji(ch);
                                    if (dictEntry) {
                                        for (const on of dictEntry.on) candidates.push(toRomaji(on));
                                        for (const kun of dictEntry.kun) {
                                            const stem = stripOkurigana(kun);
                                            candidates.push(toRomaji(stem));
                                        }
                                    }
                                } else {
                                    candidates.push(toRomaji(ch));
                                }
                                let matched = "";
                                for (const candidate of candidates) {
                                    if (candidate && remaining.startsWith(candidate)) {
                                        matched = candidate;
                                        break;
                                    }
                                }
                                if (!matched) { canSplit = false; break; }
                                perCharReadings.push(matched);
                                remaining = remaining.slice(matched.length);
                            }
                            if (canSplit && remaining === "") {
                                for (let k = 0; k < compound.match.length; k++) {
                                    const ch = compound.match[k];
                                    const reading = perCharReadings[k];
                                    if (kanjiRegex.test(ch)) {
                                        const kana = getKanjiKanaReading(ch, readingPreference) || "";
                                        result += renderKanjiRuby(ch, kana, reading, furiganaNotation, romajiNotation) + " ";
                                    } else if (kanaRegex.test(ch) && romajiNotation) {
                                        result += `<ruby>${ch}<rt>${reading}</rt></ruby> `;
                                    } else {
                                        result += escapeHtml(ch);
                                    }
                                }
                            } else {
                                for (let k = 0; k < compound.match.length; k++) {
                                    const ch = compound.match[k];
                                    if (kanjiRegex.test(ch)) {
                                        const kana = getKanjiKanaReading(ch, readingPreference) || "";
                                        const fallbackReading = perCharReadings[k] || toRomaji(kana) || escapeHtml(ch);
                                        result += renderKanjiRuby(ch, kana, fallbackReading, furiganaNotation, romajiNotation) + " ";
                                    } else if (kanaRegex.test(ch)) {
                                        const reading = romajiNotation ? getCharReadingWithContext(ch, compound.match[k + 1] || "", k === compound.match.length - 1, compound.match[k - 1] || "") : escapeHtml(ch);
                                        result += `<ruby>${ch}<rt>${reading}</rt></ruby> `;
                                    } else {
                                        result += escapeHtml(ch);
                                    }
                                }
                            }
                            j += compound.match.length - 1;
                            continue;
                        }

                        const conjMatch = matchConjugation(jpBlock, j);
                        if (conjMatch) {
                            const stemRomaji = toRomaji(conjMatch.stemReading);
                            const kanjiChar = conjMatch.match[0];
                            if (furiganaNotation && romajiNotation) {
                                result += `<ruby data-kanji="${kanjiChar}"><ruby>${kanjiChar}<rt>${conjMatch.stemReading}</rt></ruby><rt>${stemRomaji}</rt></ruby> `;
                            } else if (romajiNotation) {
                                result += renderKanjiRuby(kanjiChar, conjMatch.stemReading, stemRomaji, false, true) + " ";
                            } else if (furiganaNotation) {
                                result += renderKanjiRuby(kanjiChar, conjMatch.stemReading, "", true, false) + " ";
                            }
                            j += conjMatch.match.length - 1;
                            continue;
                        }

                        let okurigana = "";
                        let k = j + 1;
                        while (k < jpBlock.length && hiraganaRegex.test(jpBlock[k]) && !particleSet.has(jpBlock[k])) {
                            okurigana += jpBlock[k];
                            k++;
                        }

                        const pref = determineReadingPreference(c, jpBlock, j, readingPreference);

                        let kanaReading = "";
                        let romajiReading = "";

                        if (j > 0) {
                            const compoundKana = compoundReadings[jpBlock[j - 1] + c];
                            if (compoundKana) {
                                kanaReading = compoundKana;
                                romajiReading = toRomaji(compoundKana);
                            }
                        }
                        if (!romajiReading && suffixKanji.has(c) && j > 0 && !okurigana && j === jpBlock.length - 1) {
                            kanaReading = getKanjiKanaReading(c, "on") || "";
                            romajiReading = getKanjiReading(c, "on");
                        }
                        if (!romajiReading) {
                            kanaReading = getKanjiKanaReading(c, pref, okurigana || undefined) || "";
                            romajiReading = getKanjiReading(c, pref, okurigana || undefined);
                        }

                        if (romajiReading) {
                            result += renderKanjiRuby(c, kanaReading, romajiReading, furiganaNotation, romajiNotation) + " ";
                        } else {
                            result += escapeHtml(c);
                        }
                    } else if (furiganaNotation) {
                        const kana = getKanjiKanaReading(c, readingPreference) || "";
                        if (kana) {
                            result += renderKanjiRuby(c, kana, "", true, false) + " ";
                        } else {
                            result += escapeHtml(c);
                        }
                    } else {
                        result += escapeHtml(c);
                    }
                }
            }
        } else {
            let end = i;
            while (end < text.length && !japaneseRegex.test(text[end])) {
                end++;
            }
            result += escapeHtml(text.slice(i, end));
            i = end;
        }
    }

    return result;
}
