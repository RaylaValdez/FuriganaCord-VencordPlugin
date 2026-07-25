/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { toRomaji } from "./kana";
import { getRawKanjiEntry, stripOkurigana } from "./kanji";

type VerbType = "godan" | "ichidan" | "irregular";

// kana vowel rows: a=あ, i=い, u=う, e=え, o=お
const vowelRows: Record<string, [string, string, string, string, string]> = {
    "か": ["か", "き", "く", "け", "こ"],
    "が": ["が", "ぎ", "ぐ", "げ", "ご"],
    "さ": ["さ", "し", "す", "せ", "そ"],
    "た": ["た", "ち", "つ", "て", "と"],
    "な": ["な", "に", "ぬ", "ね", "の"],
    "は": ["は", "ひ", "ふ", "へ", "ほ"],
    "ば": ["ば", "び", "ぶ", "べ", "ぼ"],
    "ま": ["ま", "み", "む", "め", "も"],
    "ら": ["ら", "り", "る", "れ", "ろ"],
    "わ": ["わ", "ゐ", "う", "ゑ", "を"],
};

// kana -> vowel index (0=a, 1=i, 2=u, 3=e, 4=o)
const vowelIndex: Record<string, number> = {};
for (const [, row] of Object.entries(vowelRows)) {
    for (let i = 0; i < 5; i++) {
        vowelIndex[row[i]] = i;
    }
}
vowelIndex["う"] = 2; // override for う row

// godan て/た form音便 (euphonic changes)
const teTaKana: Record<string, [string, string]> = {
    "う": ["っ", "っ"],
    "つ": ["っ", "っ"],
    "る": ["っ", "っ"],
    "く": ["い", "い"],
    "ぐ": ["い", "い"],
    "す": ["し", "し"],
    "ぶ": ["ん", "ん"],
    "む": ["ん", "ん"],
    "ぬ": ["ん", "ん"],
};

// godan て/た form endings after音便
const teEndings: Record<string, string> = {
    "っ": "て",
    "い": "て",
    "し": "て",
    "ん": "で",
};

const taEndings: Record<string, string> = {
    "っ": "た",
    "い": "た",
    "し": "た",
    "ん": "だ",
};

function getVowelRow(kana: string): [string, string, string, string, string] | null {
    // Find which row this kana belongs to by checking its vowel
    const vi = vowelIndex[kana];
    if (vi === undefined) return null;
    for (const row of Object.values(vowelRows)) {
        if (row[vi] === kana) return row;
    }
    return null;
}

function getGodanKana(stem: string, vowelIdx: number): string {
    // Get the godan conjugation kana for a given vowel index
    const lastKana = stem[stem.length - 1];
    const row = getVowelRow(lastKana);
    if (!row) return "";
    return stem.slice(0, -1) + row[vowelIdx];
}

function isIchidan(stem: string, reading: string): boolean {
    // Check if a verb is ichidan by examining the kun reading
    // Ichidan readings end in "e.ru" or "i.ru" pattern (e.g. "ta.be.ru", "mi.ru")
    // The reading after the dot should be like "る" or end in ".る"
    const afterDot = reading.includes(".") ? reading.slice(reading.lastIndexOf(".") + 1) : "";
    if (afterDot === "る") return true;

    // Also check if the stem + る matches an ichidan pattern
    // Ichidan: the kana before る is in the i or e vowel column
    if (afterDot.length > 0) {
        const lastBeforeRu = afterDot[afterDot.length - 1];
        const vi = vowelIndex[lastBeforeRu];
        if (vi === 1 || vi === 3) return true; // i or e vowel = ichidan
    }
    return false;
}

function getVerbType(stem: string, reading: string): VerbType {
    // Check for irregular verbs first
    const fullReading = reading.replace(/\./g, "");
    if (fullReading === "する" || fullReading === "す") return "irregular";
    if (fullReading === "くる" || fullReading === "き" || fullReading === "く") return "irregular";

    // Check for common irregular patterns
    if (stem.endsWith("す") && (stem.length === 1 || stem === "す")) {
        // する verb
        return "irregular";
    }

    // Determine godan vs ichidan from the reading
    if (isIchidan(stem, reading)) return "ichidan";
    return "godan";
}

export interface ConjugationResult {
    kana: string;
    romaji: string;
    form: string;
    stemReading?: string;
}

export function conjugateVerb(kanji: string, okurigana: string): ConjugationResult[] | null {
    const entry = getRawKanjiEntry(kanji);
    if (!entry || !entry.k || entry.k.length === 0) return null;

    // Try each kun reading
    for (const reading of entry.k) {
        const stem = stripOkurigana(reading);
        if (!stem) continue;

        const verbType = getVerbType(stem, reading);
        const results = generateConjugations(stem, verbType, okurigana);
        if (results.length > 0) return results;
    }

    return null;
}

function generateConjugations(stem: string, verbType: VerbType, okurigana: string): ConjugationResult[] {
    const results: ConjugationResult[] = [];

    if (verbType === "irregular") {
        return generateIrregularConjugations(stem, okurigana);
    }

    if (verbType === "ichidan") {
        return generateIchidanConjugations(stem, okurigana);
    }

    // Godan conjugations
    return generateGodanConjugations(stem, okurigana);
}

function generateGodanConjugations(stem: string, okurigana: string): ConjugationResult[] {
    const results: ConjugationResult[] = [];
    const lastKana = stem[stem.length - 1];
    const stemBase = stem.slice(0, -1);

    // Dictionary form: stem + u-vowel
    const dictForm = getGodanKana(stem, 2);
    if (dictForm) {
        results.push({
            kana: dictForm,
            romaji: toRomaji(dictForm),
            form: "dictionary",
        });
    }

    // Negative: stem + a-vowel + ない
    const negStem = getGodanKana(stem, 0);
    if (negStem) {
        const neg = negStem + "ない";
        results.push({
            kana: neg,
            romaji: toRomaji(neg),
            form: "negative",
        });
    }

    // Polite: stem + i-vowel + ます
    const politeStem = getGodanKana(stem, 1);
    if (politeStem) {
        const polite = politeStem + "ます";
        results.push({
            kana: polite,
            romaji: toRomaji(polite),
            form: "polite",
        });
    }

    // て and た forms: sound change + ending
    const teTa = teTaKana[lastKana];
    if (teTa) {
        const teSuffix = teEndings[teTa[0]];
        if (teSuffix) {
            results.push({
                kana: stemBase + teTa[0] + teSuffix,
                romaji: toRomaji(stemBase + teTa[0] + teSuffix),
                form: "te",
            });
        }
        const taSuffix = taEndings[teTa[0]];
        if (taSuffix) {
            results.push({
                kana: stemBase + teTa[0] + taSuffix,
                romaji: toRomaji(stemBase + teTa[0] + taSuffix),
                form: "past",
            });
        }
    }

    // Potential, Passive, Causative: stem + a-vowel
    const aStem = negStem; // already computed above (a-vowel stem)
    if (aStem) {
        results.push({
            kana: aStem + "る",
            romaji: toRomaji(aStem + "る"),
            form: "potential",
        });
        results.push({
            kana: aStem + "れる",
            romaji: toRomaji(aStem + "れる"),
            form: "passive",
        });
        results.push({
            kana: aStem + "せる",
            romaji: toRomaji(aStem + "せる"),
            form: "causative",
        });
    }

    // Volitional: stem + o-vowel + う
    const volStem = getGodanKana(stem, 4);
    if (volStem) {
        const volitional = volStem + "う";
        results.push({
            kana: volitional,
            romaji: toRomaji(volitional),
            form: "volitional",
        });
    }

    // Conditional: stem + e-vowel + ば
    const condStem = getGodanKana(stem, 3);
    if (condStem) {
        const conditional = condStem + "ば";
        results.push({
            kana: conditional,
            romaji: toRomaji(conditional),
            form: "conditional",
        });
    }

    // Imperative: stem + e-vowel
    const impStem = getGodanKana(stem, 3);
    if (impStem) {
        results.push({
            kana: impStem,
            romaji: toRomaji(impStem),
            form: "imperative",
        });
    }

    return results;
}

function generateIchidanConjugations(stem: string, okurigana: string): ConjugationResult[] {
    const results: ConjugationResult[] = [];

    // Dictionary: stem + る
    const dict = stem + "る";
    results.push({
        kana: dict,
        romaji: toRomaji(dict),
        form: "dictionary",
    });

    // Negative: stem + ない
    results.push({
        kana: stem + "ない",
        romaji: toRomaji(stem + "ない"),
        form: "negative",
    });

    // Polite: stem + ます
    results.push({
        kana: stem + "ます",
        romaji: toRomaji(stem + "ます"),
        form: "polite",
    });

    // て form: stem + て
    results.push({
        kana: stem + "て",
        romaji: toRomaji(stem + "て"),
        form: "te",
    });

    // た form: stem + た
    results.push({
        kana: stem + "た",
        romaji: toRomaji(stem + "た"),
        form: "past",
    });

    // Potential/Passive: stem + られる
    results.push({
        kana: stem + "られる",
        romaji: toRomaji(stem + "られる"),
        form: "potential",
    });

    // Causative: stem + させる
    results.push({
        kana: stem + "させる",
        romaji: toRomaji(stem + "させる"),
        form: "causative",
    });

    // Volitional: stem + よう
    results.push({
        kana: stem + "よう",
        romaji: toRomaji(stem + "よう"),
        form: "volitional",
    });

    // Conditional: stem + れば
    results.push({
        kana: stem + "れば",
        romaji: toRomaji(stem + "れば"),
        form: "conditional",
    });

    // Imperative: stem + ろ
    results.push({
        kana: stem + "ろ",
        romaji: toRomaji(stem + "ろ"),
        form: "imperative",
    });

    return results;
}

function generateIrregularConjugations(stem: string, okurigana: string): ConjugationResult[] {
    const results: ConjugationResult[] = [];
    const fullReading = stem + "る";

    // Determine if this is する or 来る
    if (stem === "す" || fullReading === "する") {
        // する conjugations
        const forms: [string, string][] = [
            ["する", "dictionary"],
            ["しない", "negative"],
            ["します", "polite"],
            ["して", "te"],
            ["した", "past"],
            ["できる", "potential"],
            ["される", "passive"],
            ["させる", "causative"],
            ["しよう", "volitional"],
            ["すれば", "conditional"],
            ["しろ", "imperative"],
        ];
        for (const [kana, form] of forms) {
            results.push({ kana, romaji: toRomaji(kana), form });
        }
    } else if (stem === "き" || fullReading === "くる" || stem === "く") {
        // 来る conjugations
        const forms: [string, string][] = [
            ["くる", "dictionary"],
            ["こない", "negative"],
            ["きます", "polite"],
            ["きて", "te"],
            ["きた", "past"],
            ["こられる", "potential"],
            ["こられる", "passive"],
            ["こさせる", "causative"],
            ["こよう", "volitional"],
            ["くれば", "conditional"],
            ["こい", "imperative"],
        ];
        for (const [kana, form] of forms) {
            results.push({ kana, romaji: toRomaji(kana), form });
        }
    }

    return results;
}

export function matchConjugation(text: string, pos: number): { match: string; reading: string; stemReading: string; form: string; } | null {
    // Try to match a conjugated verb starting at pos
    // The text at pos should start with a kanji followed by hiragana
    const char = text[pos];
    if (!char) return null;

    // Only process if first char is kanji
    const kanjiRegex = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
    if (!kanjiRegex.test(char)) return null;

    // Check if this kanji has kun readings (i.e., it's a verb kanji)
    const entry = getRawKanjiEntry(char);
    if (!entry || !entry.k || entry.k.length === 0) return null;

    // Extract the okurigana (following hiragana)
    let okurigana = "";
    let k = pos + 1;
    const hiraganaRegex = /[\u3040-\u309f]/;
    while (k < text.length && hiraganaRegex.test(text[k])) {
        okurigana += text[k];
        k++;
    }

    if (!okurigana) return null;

    // Get the stem reading from the kun reading for ruby annotation
    let stemReading = "";
    for (const reading of entry.k) {
        stemReading = stripOkurigana(reading);
        if (stemReading) break;
    }

    // Try to conjugate and find a match
    const results = conjugateVerb(char, okurigana);
    if (!results) return null;

    // Find the best match: the conjugation that matches the most following text
    for (const result of results) {
        // Check if the conjugated kana matches the text after the kanji
        const remaining = text.slice(pos + 1, pos + 1 + result.kana.length);
        if (remaining === result.kana) {
            return {
                match: text.slice(pos, pos + 1 + result.kana.length),
                reading: result.kana,
                stemReading,
                form: result.form,
            };
        }
    }

    return null;
}
