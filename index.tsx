/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ChatBarButton, type ChatBarButtonFactory } from "@api/ChatButtons";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { FormSwitch } from "@components/FormSwitch";
import { Divider } from "@components/index";
import definePlugin, { type IconComponent, OptionType } from "@utils/types";
import { type RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, useLayoutEffect, useRef, useState } from "@webpack/common";

import { loadCompounds } from "./compounds";
import { loadKanaMap, onKanaReady, toRomaji } from "./kana";
import { type KanjiInfo, loadDict, lookupKanji, onReady, setNameOverrides, stripOkurigana } from "./kanji";
import { containsJapanese, escapeHtml, type RenderOptions, renderRubyText } from "./romaji";

const settings = definePluginSettings({
    furiganaNotation: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Show kana readings above kanji characters (furigana)",
    },
    romajiNotation: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Show romaji readings under Japanese characters",
    },
    usernameNotation: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Show readings under Japanese usernames in chat",
    },
    annotationFontSize: {
        type: OptionType.NUMBER,
        default: 75,
        description: "Annotation font size (%)",
        isValid: (v: number) => v >= 30 && v <= 200,
    },
    _separator1: {
        type: OptionType.COMPONENT,
        description: "",
        component: () => <Divider style={{ margin: "16px 0" }} />,
    },
    kanjiTooltips: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Show kanji info tooltip on hover",
    },
    tooltipFontSize: {
        type: OptionType.NUMBER,
        default: 85,
        description: "Tooltip font size (%)",
        isValid: (v: number) => v >= 50 && v <= 200,
    },
    _separator2: {
        type: OptionType.COMPONENT,
        description: "",
        component: () => <Divider style={{ margin: "16px 0" }} />,
    },
    readingPreference: {
        type: OptionType.SELECT,
        default: "kun",
        description: "Preferred reading for kanji",
        options: [
            { label: "Kun'yomi (訓読み)", value: "kun" },
            { label: "On'yomi (音読み)", value: "on" },
        ],
    },
    nameOverrides: {
        type: OptionType.STRING,
        default: '{"天道 剣":"Tendou Tsurugi","芽森":"Me Mori"}',
        description: 'JSON object of name to reading overrides, e.g. {"名前":"yomi"}',
    },
    baseUrl: {
        type: OptionType.STRING,
        default: "https://raw.githubusercontent.com/RaylaValdez/jp-kanji/main/",
        description: "Base URL for dictionary data files (kana.json, kanji.json, compounds.json)",
    },
});

const JPSettingsIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg
        width={width}
        height={height}
        className={className}
        viewBox="0 0 24 24"
    >
        <text x="12" y="21" fontSize="25" fill="currentColor" textAnchor="middle">あ</text>
    </svg>
);

function JPSettingsModal({ rootProps }: { rootProps: RenderModalProps; }) {
    const s = settings.use(["furiganaNotation", "romajiNotation", "usernameNotation", "kanjiTooltips", "readingPreference"]);

    return (
        <Modal {...rootProps} title="FuriganaCord Settings">
            <FormSwitch
                title="Furigana"
                description="Show kana readings above kanji characters"
                value={s.furiganaNotation}
                onChange={v => (s.furiganaNotation = v)}
                hideBorder
            />
            <FormSwitch
                title="Romaji"
                description="Show romaji readings under Japanese characters"
                value={s.romajiNotation}
                onChange={v => (s.romajiNotation = v)}
                hideBorder
            />
            <FormSwitch
                title="Kanji Tooltips"
                description="Show kanji info tooltip on hover"
                value={s.kanjiTooltips}
                onChange={v => (s.kanjiTooltips = v)}
                hideBorder
            />
        </Modal>
    );
}

const JPSettingsButton: ChatBarButtonFactory = ({ isMainChat }) => {
    if (!isMainChat) return null;

    return (
        <ChatBarButton
            tooltip="FuriganaCord Settings"
            onClick={() => openModal(props => <JPSettingsModal rootProps={props} />)}
            buttonProps={{ "aria-haspopup": "dialog" }}
        >
            <JPSettingsIcon />
        </ChatBarButton>
    );
};

interface RubyAnnotatorProps {
    message?: {
        content?: string;
    };
}

interface TooltipState {
    x: number;
    y: number;
    kanji: string;
    info: KanjiInfo;
}

let sharedTooltipEl: HTMLDivElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

function tooltipHTML(state: TooltipState): string {
    const { kanji, info } = state;
    const jishoUrl = `https://jisho.org/search/${encodeURIComponent(kanji)}%20%23kanji`;
    let html = `<div class="jp-kanji-tooltip-char"><a href="${jishoUrl}" target="_blank" rel="noopener noreferrer" class="jp-kanji-link">${escapeHtml(kanji)}</a></div>`;
    if (info.kun.length > 0) {
        html += "<div class=\"jp-kanji-tooltip-row\"><span class=\"jp-kanji-tooltip-label\">訓</span><span>";
        html += info.kun.map(r => {
            const stem = stripOkurigana(r);
            const romaji = toRomaji(stem);
            return `<ruby>${stem}<rt>${romaji}</rt></ruby>`;
        }).join("\u3001");
        html += "</span></div>";
    }
    if (info.on.length > 0) {
        html += "<div class=\"jp-kanji-tooltip-row\"><span class=\"jp-kanji-tooltip-label\">音</span><span>";
        html += info.on.map(r => {
            const romaji = toRomaji(r);
            return `<ruby>${r}<rt>${romaji}</rt></ruby>`;
        }).join("");
        html += "</span></div>";
    }
    html += `<div class="jp-kanji-tooltip-row" style="opacity:0.7"><span>${info.meanings.join(", ")}</span></div>`;
    return html;
}

function scheduleHide() {
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
        hideTooltip();
        hideTimeout = null;
    }, 500);
}

function cancelHide() {
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
}

function showTooltip(state: TooltipState) {
    if (!sharedTooltipEl || !document.body.contains(sharedTooltipEl)) {
        sharedTooltipEl = document.createElement("div");
        sharedTooltipEl.className = "jp-kanji-tooltip";
        sharedTooltipEl.addEventListener("mouseenter", cancelHide);
        sharedTooltipEl.addEventListener("mouseleave", scheduleHide);
        document.body.appendChild(sharedTooltipEl);
    }
    sharedTooltipEl.style.cssText = `
        position: fixed;
        left: ${state.x}px;
        top: ${state.y}px;
        transform: translateY(-100%);
        z-index: 1000;
        pointer-events: auto;
        font-size: ${settings.store.tooltipFontSize / 100}em;
    `;
    sharedTooltipEl.innerHTML = tooltipHTML(state);
    cancelHide();
}

function hideTooltip() {
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
    if (sharedTooltipEl) {
        sharedTooltipEl.remove();
        sharedTooltipEl = null;
    }
}

const RubyAnnotator: React.FC<RubyAnnotatorProps> = ({ message }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [dictReady, setDictReady] = useState(false);

    settings.use(["furiganaNotation", "romajiNotation", "usernameNotation", "readingPreference", "annotationFontSize"]);

    const { furiganaNotation, romajiNotation, readingPreference, annotationFontSize: rubyFontSize } = settings.store;

    useLayoutEffect(() => {
        onReady(() => setDictReady(true));
        onKanaReady(() => setDictReady(prev => prev || true));
    }, []);

    useLayoutEffect(() => {
        if (!ref.current) return;
        if (!dictReady) return;
        const container = ref.current.parentElement;
        if (!container) return;

        const existing = container.querySelectorAll("[data-jp-ruby]");
        for (const span of existing) {
            const original = span.getAttribute("data-original-text") ?? span.textContent ?? "";
            const text = document.createTextNode(original);
            span.parentNode?.replaceChild(text, span);
        }

        const content = message?.content;
        if (!content || !containsJapanese(content)) return;

        if (!romajiNotation && !furiganaNotation) return;

        const renderOptions: RenderOptions = {
            furiganaNotation,
            romajiNotation,
            readingPreference: readingPreference as "kun" | "on",
        };

        container.style.setProperty("--jp-ruby-font-size", `${rubyFontSize / 100}em`);

        const walker = document.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (ref.current?.contains(node))
                        return NodeFilter.FILTER_REJECT;
                    const el = node.parentElement;
                    if (el?.closest("[class*='repliedTextPreview']"))
                        return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const modifications: Array<{ node: Text; html: string; }> = [];
        let node: Text | null;
        while ((node = walker.nextNode() as Text | null)) {
            const text = node.textContent || "";
            if (!containsJapanese(text)) continue;
            modifications.push({ node, html: renderRubyText(text, renderOptions) });
        }

        for (const { node, html } of modifications) {
            const span = document.createElement("span");
            span.setAttribute("data-jp-ruby", "");
            span.setAttribute("data-original-text", node.textContent ?? "");
            span.innerHTML = html;
            node.parentNode?.replaceChild(span, node);
        }

        const handleKanjiEnter = (e: Event) => {
            if (!settings.store.kanjiTooltips) return;
            const el = e.currentTarget as HTMLElement;
            const char = (el.getAttribute("data-kanji") || "")[0] || "";
            const info = lookupKanji(char);
            if (info) {
                cancelHide();
                const mx = (e as MouseEvent).clientX;
                const my = (e as MouseEvent).clientY;
                showTooltip({
                    x: Math.min(mx, window.innerWidth - 160),
                    y: Math.max(40, my),
                    kanji: char,
                    info,
                });
            }
        };
        const handleKanjiLeave = () => scheduleHide();

        const kanjiEls = container.querySelectorAll("[data-kanji]");
        kanjiEls.forEach(el => {
            el.addEventListener("mouseenter", handleKanjiEnter);
            el.addEventListener("mouseleave", handleKanjiLeave);
        });

        return () => {
            kanjiEls.forEach(el => {
                el.removeEventListener("mouseenter", handleKanjiEnter);
                el.removeEventListener("mouseleave", handleKanjiLeave);
            });
        };
    }, [message?.content, furiganaNotation, romajiNotation, readingPreference, rubyFontSize, dictReady]);

    return <div ref={ref} style={{ display: "none" }} />;
};

const UsernameAnnotator: React.FC<{ name: string; }> = ({ name }) => {
    const ref = useRef<HTMLSpanElement>(null);
    const [dictReady, setDictReady] = useState(false);

    settings.use(["furiganaNotation", "romajiNotation", "readingPreference"]);

    useLayoutEffect(() => {
        onReady(() => setDictReady(true));
        onKanaReady(() => setDictReady(prev => prev || true));
    }, []);

    useLayoutEffect(() => {
        if (!ref.current) return;

        let ancestor: HTMLElement | null = ref.current.parentElement;
        let effectBg = "";
        while (ancestor && ancestor !== document.body) {
            const cs = getComputedStyle(ancestor);
            if (cs.webkitBackgroundClip === "text" && cs.backgroundImage !== "none") {
                effectBg = cs.backgroundImage;
                break;
            }
            ancestor = ancestor.parentElement;
        }

        if (effectBg) {
            ref.current.style.setProperty("--jp-effect-bg", effectBg);
            ref.current.dataset.hasEffect = "";
        } else {
            ref.current.style.removeProperty("--jp-effect-bg");
            delete ref.current.dataset.hasEffect;
        }
    });

    const renderOptions: RenderOptions = {
        furiganaNotation: settings.store.furiganaNotation,
        romajiNotation: settings.store.romajiNotation,
        readingPreference: settings.store.readingPreference as "kun" | "on",
    };

    if (!dictReady) return <span>{name}</span>;

    const html = renderRubyText(name, renderOptions);

    const handleOver = (e: React.MouseEvent<HTMLSpanElement>) => {
        const target = (e.target as HTMLElement).closest("[data-kanji]");
        if (!target || !settings.store.kanjiTooltips) return;
        const char = (target.getAttribute("data-kanji") || "")[0] || "";
        const info = lookupKanji(char);
        if (info) {
            cancelHide();
            showTooltip({
                x: Math.min(e.clientX, window.innerWidth - 160),
                y: Math.max(40, e.clientY),
                kanji: char,
                info,
            });
        }
    };
    const handleLeave = () => scheduleHide();

    return (
        <span
            ref={ref}
            data-jp-ruby=""
            data-username-ruby=""
            onMouseOver={handleOver}
            onMouseLeave={handleLeave}
            dangerouslySetInnerHTML={{
                __html: html
            }}
        />
    );
};

export default definePlugin({
    name: "FuriganaCord",
    description: "Shows romaji under Japanese characters, or furigana above Kanji in messages",
    tags: ["Chat"],
    authors: [{
        name: "gerry_of_ravine",
        id: 294899635292602379n
    }],

    settings,

    chatBarButton: {
        icon: JPSettingsIcon,
        render: JPSettingsButton,
    },

    async start() {
        const base = settings.store.baseUrl;
        const url = base.endsWith("/") ? base : base + "/";

        try {
            setNameOverrides(JSON.parse(settings.store.nameOverrides));
        } catch { }

        Promise.all([
            loadKanaMap(url + "kana.json"),
            loadDict(url + "kanji.json"),
            loadCompounds(url + "compounds.json"),
        ]).then(() => {
            console.log("[FuriganaCord] All dictionaries loaded!");
        });

        console.log("[FuriganaCord] Loading dictionaries...");
    },

    stop() {
        hideTooltip();
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
    },

    patches: [
        {
            find: ".SEND_FAILED,",
            replacement: {
                match: /\]:\i.isUnsupported.{0,20}?,children:\[/,
                replace: "$&arguments[0]?.message?.content&&$self.RubyAnnotation({message: arguments[0].message}),"
            }
        },
        {
            find: '="SYSTEM_TAG"',
            replacement: {
                match: /(?<=onContextMenu:\i,children:)\i\?(?=.{0,100}?user[Nn]ame:)/,
                replace: "$self.UsernameAnnotation(arguments[0]),_oldChildren:$&"
            }
        }
    ],

    RubyAnnotation: ErrorBoundary.wrap(RubyAnnotator, { noop: true }),

    UsernameAnnotation(props: any) {
        try {
            let name = typeof props._oldChildren === "string" ? props._oldChildren : "";

            if (!name) {
                const nick = props.author?.nick || props.nick;
                const user = props.message?.author;
                name = nick || user?.globalName || user?.username || props.username || props.displayName || "";
            }

            if (!name) return null;
            if (!settings.store.usernameNotation || !containsJapanese(name)) return name;

            return <UsernameAnnotator name={name} />;
        } catch (e) {
            console.error("[FuriganaCord] UsernameAnnotation error:", e);
            return null;
        }
    },
});
