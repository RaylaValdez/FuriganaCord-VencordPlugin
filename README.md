> # FuriganaCord
A plugin for Vencord that adds Japanese reading annotations to Discord messages.

## What it does
- **Furigana** - shows kana readings above kanji characters
- **Romaji** - shows romaji pronunciation under Japanese characters
- **Username readings** - shows readings under Japanese usernames in chat
- **Kanji tooltips** - hover over any kanji to see its kun/on readings, meanings, and a link to Jisho.org
- **Verb conjugation** - recognizes common verb forms and shows the stem reading

## Chatbar button
There's a あ button in the chat input that opens a quick settings modal with toggles for furigana, romaji, and kanji tooltips.

## Settings
| Setting | Default | What it does |
|---|---|---|
| Furigana | on | Show kana above kanji |
| Romaji | on | Show romaji under characters |
| Username readings | on | Show readings under usernames |
| Annotation font size | 75% | Size of the ruby annotations (30-200%) |
| Kanji tooltips | on | Show hover tooltip with readings and meanings |
| Tooltip font size | 85% | Size of the tooltip text (50-200%) |
| Reading preference | Kun'yomi | Choose between kun'yomi and on'yomi readings |
| Name overrides | - | JSON object mapping names to custom readings |

## Setup
This plugin fetches dictionary data from GitHub on first load. The default source is my repo: https://github.com/RaylaValdez/jp-kanji

If you want to host your own dictionaries, change the Base URL setting to point to a folder containing `kana.json`, `kanji.json`, and `compounds.json`.

### Building from source
Vencord doesn't support loading custom plugins out of the box. You need to build from source:
1. Follow the guide at https://docs.vencord.dev/installing/custom-plugins/
2. Clone this repo into `src/userplugins/`
3. Build Vencord as normal

To update, run `git pull` inside the plugin folder.
