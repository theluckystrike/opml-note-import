# OPML Note Import

Convert outline exports into ordered Markdown notes. Start with an OPML file in your vault, inspect the proposed paths, then create one note for each root item, or for each item at a deeper level that you choose. Child items become nested lists.

The source file stays in place. You can read the new files with the plugin turned off.

## Features

### Select a local outline

<img src="https://raw.githubusercontent.com/theluckystrike/opml-note-import/HEAD/docs/select.png" alt="Source selector with sample outline files in the vault" width="720">

The command lists files with an .opml extension from the current vault. Choose a source file, a note level, an output folder, and an optional file name prefix. The import reads the file through the Obsidian vault API. The import decodes the file with the encoding that its XML declaration names, such as ISO-8859-1.

### Keep nested items and notes

<img src="https://raw.githubusercontent.com/theluckystrike/opml-note-import/HEAD/docs/preview.png" alt="Preview with root note paths and nested outline text" width="720">

Each selected item becomes the heading of a separate note. Child order and indentation follow the source outline. The parser reads text, note, and _note attributes. If an item has both note attributes, both values appear in source attribute order. XML character references become text. Escaped HTML stays literal text, so a bold tag does not become Markdown formatting. Common URL attributes appear as text beneath the item.

### Choose the note level

<img src="https://raw.githubusercontent.com/theluckystrike/opml-note-import/HEAD/docs/levels.png" alt="Level 2 preview with one note for each dated child of a journal root" width="720">

Level 1 makes one note for each root item. If one root item holds the whole outline, choose level 2 or higher. The plugin then makes one note for each item at that level, in source order. Levels run from 1 to 6. Items above the chosen level make no notes. Note text and URLs on those items are not imported. The preview and the import result name each such item with note text or URLs, and each branch that ends above the chosen level.

### Inspect file name conflicts

<img src="https://raw.githubusercontent.com/theluckystrike/opml-note-import/HEAD/docs/conflicts.png" alt="Duplicate titles shown with numbered file names" width="720">

Preview lists the proposed paths before you write files. Duplicate safe names receive a stable numbered suffix, starting at 2. Case variants also count as duplicates. If a destination exists, the import skips that path and reports it. A file that blocks a destination folder produces an error before the import starts.

### Read parse errors

<img src="https://raw.githubusercontent.com/theluckystrike/opml-note-import/HEAD/docs/invalid.png" alt="Malformed XML error in the preview" width="720">

Invalid XML stops the plan before note creation. Files with a DOCTYPE or entity declaration are rejected before DOMParser runs. The import does not fetch feeds or external entities. Unknown outline attributes are reported by name, so you can inspect data that this version does not convert.

### Save layouts (Pro)

<img src="https://raw.githubusercontent.com/theluckystrike/opml-note-import/HEAD/docs/presets.png" alt="Pro layout controls with a named project preset" width="720">

Pro can save a named layout with its level, folder, prefix, and source property option. Select a saved layout to apply those options to another outline. Saving the same name replaces that preset. The plugin keeps up to 50 layouts.

### Preview repeated imports (Pro)

<img src="https://raw.githubusercontent.com/theluckystrike/opml-note-import/HEAD/docs/repeat.png" alt="Repeat preview with changed and unchanged output paths" width="720">

Pro compares planned Markdown with the file at each destination path. It labels the file new, changed, or unchanged. A folder at the output path is shown as blocked. For changed text, it shows lines present only in the planned text with a plus sign and lines present only in the existing text with a minus sign. The comparison does not update existing files. Reordered lines can produce a changed label without added or removed lines.

Without Pro, Save preset and Preview changes show a Sponsor on GitHub notice.

<img src="https://raw.githubusercontent.com/theluckystrike/opml-note-import/HEAD/docs/opml-note-import.gif" alt="Select and preview a sample outline before importing" width="720">

## Install

Use the release files supplied by the publisher. Copy main.js, manifest.json, and styles.css into a folder named opml-note-import inside your vault's community plugin folder. Restart Obsidian or reload community plugins, then enable OPML Note Import.

The code uses public Obsidian APIs and browser APIs. No Node or Electron API is part of the import. This permits mobile installation, but a phone or tablet test has not been completed.

## Usage

1. Export an outline as OPML from your outline tool.
2. Copy the .opml file into the vault. If it is not in the file explorer, check the vault's file visibility options.
3. Run OPML Note Import: Import an outline file from the command palette.
4. Select the source, level, folder, prefix, and source property option.
5. Select Preview. Expand a path to inspect its Markdown text.
6. Select Import notes. Read the created, skipped, and error paths in the result.

A destination folder is created when needed. The default folder is OPML imports. An empty folder field puts notes at the vault root. The importer rejects dot segments, hidden folder segments, and reserved path characters. A note title is limited to 100 Unicode characters and 240 UTF-8 bytes, then cleaned for a file name. Leading dots get an underscore. A missing or blank title becomes Untitled. A reserved device name gets an underscore prefix.

For a repeated export, use the same level, folder, and prefix to compare matching paths. A renamed item appears as a new path. The repeat preview does not find removed items or notes that you moved elsewhere.

## Settings

After a minor or major update, this plugin opens one What's new tab in the background. The tab and settings card suggest other NoteMods plugins and Zovo Chat and link to notemods.com for feedback ([privacy](https://notemods.com/privacy/)). The tab sends no data. Turn the tab off in Settings.

The import dialog contains the layout controls. Source properties are on by default. They add the source path, root number, and source id to YAML frontmatter. A level above 1 also adds the level and the parent items. A source id consists of the vault source path and the item's position, such as Journal.opml#1.2; it is not a permanent identity if you reorder items.

The plugin account tab contains the optional GitHub Sponsors controls. There is no paid note count limit. The parser limits remain the same in both tiers.

## FAQ

Can this import a feed subscription export? It can preserve outline text and common URL attributes, including xmlUrl. It does not download articles, subscribe to feeds, or import attachments.

What happens to rich text? HTML that arrives as escaped attribute text remains visible as text. Markdown control characters are escaped to reduce accidental formatting. Text outside the supported outline attributes is not converted.

What limits apply? The parser rejects input over two million text characters, more than 100 nested XML levels, or more than 10,000 outline items. Files created before a storage error remain in the vault; the import does not roll them back.

What was not tested? Linux and Windows desktops, physical Android and iOS devices, exports from installed outline applications, very large production vaults, live paid sponsorship, and interrupted writes on remote storage were not tested. Desktop end-to-end tests exercise the file selector, preview, import, parse rejection, and Pro controls with a simulated Sponsors response.

## Payment, account and network

The core features are free. Pro features need a GitHub Sponsors sponsorship of theluckystrike: $5 a month or more, or $15 once. A total payment of $15 meets the payment requirement for Pro without further payment. Sign-in and the checks below still apply. Your notes stay readable and editable with or without Pro.

GitHub handles the payment. Sponsor at https://github.com/sponsors/theluckystrike. You need no account for the free features. Pro needs the GitHub account that sponsors.

Until you select "Sign in with GitHub" in the settings, OPML Note Import makes no network requests. Sign in uses the GitHub device flow. OPML Note Import sends its public client ID and the scope `read:user` to `https://github.com/login/device/code` and shows you a code. While you enter the code at https://github.com/login/device, it asks `https://github.com/login/oauth/access_token` every few seconds to check the sign-in status. The scope permits profile reads only. GitHub needs this access to show the sponsorship tier. It grants no repository scope and no write access.

After sign in, OPML Note Import sends one query to `https://api.github.com/graphql`. It checks if the signed-in account sponsors theluckystrike. It asks for the tier and the total payment to theluckystrike. The plugin reuses a successful check for 7 days. Failed checks can retry after 6 hours. Select Refresh to request an earlier check. It sends no note content, file names or other vault data, and it has no telemetry.

After a successful check, Pro can work offline for up to 14 days. Sign out or a negative sponsorship answer turns Pro off. The plugin stores the GitHub token through the secret storage API of Obsidian. It does not put the token in its saved settings or its local sponsorship data. The local storage of this device keeps your GitHub login, the tier and the time of the last check. Sign out clears the token. You can also revoke the access in your GitHub settings, under Applications.

## Support

The publisher is [theluckystrike](https://github.com/theluckystrike). For a support report, include your Obsidian version, the step that failed, and the error text. A short OPML example with private content removed can help reproduce a parse problem. Do not include a GitHub access token. Its source and release files use the MIT license.

## Community

Questions, bugs or plugin ideas? Talk to me and other Obsidian users in [Zovo Chat](https://t.me/+k2MM-BIc7SQ5OWM0) on Telegram. It has a topic for these plugins. You can also open an issue here.
