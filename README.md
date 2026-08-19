<p align="center">
  <img src="https://github.com/user-attachments/assets/29947627-b2ff-4ecd-8a2b-4df932aca657" alt="logo" width="200" style="background: transparent; display: inline-block;" />
</p>

<p align="center">
  A modular UI upgrade for Jellyfin that introduces a cinematic home slider, richer metadata,
  hover previews, profile personalization, GMMP music playback, Netflix-style pause and details views,
  studio hubs, notifications, parental PIN control, and a centralized settings experience.
</p>

<p align="center">
  <a href="https://github.com/G-grbz/Jellyfin-MonWUI-Plugin#notes">
    <img
      alt="Install Name"
      src="https://img.shields.io/badge/Install%20Name-JMSFusion-0ea5e9?style=for-the-badge"
    />
  </a>

  <a href="https://github.com/G-grbz/Jellyfin-MonWUI-Plugin/releases/latest">
    <img
      alt="Version"
      src="https://img.shields.io/github/v/release/G-grbz/Jellyfin-MonWUI-Plugin?style=for-the-badge&cacheSeconds=3600"
    />
  </a>

  <a href="https://github.com/G-grbz/Jellyfin-MonWUI-Plugin/blob/main/LICENSE">
    <img
      alt="License"
      src="https://img.shields.io/badge/License-GPLv3-7c3aed?style=for-the-badge"
    />
  </a>
</p>


<p align="center">
  <a href="#overview">Overview</a> •
  <a href="#highlights">Highlights</a> •
  <a href="docs/seerr-arr-integration.md">Seerr & Arr Integration</a> •
  <a href="#installation">Installation</a> •
  <a href="#notes">Notes</a> •
  <a href="#license">License</a> •
  <a href="https://github.com/G-grbz/G-TMCE">G-TMCE</a>
</p>

---

## Overview

**Jellyfin MonWUI Plugin** appears in Jellyfin as **JMSFusion** and acts as an all-in-one frontend enhancement layer built around a modular slider system located in `Resources/slider/`.

Rather than applying a single visual tweak, it enhances the entire browsing experience — including home screen presentation, metadata depth, hover interactions, profile flow, music playback, pause behavior, library discovery, and settings management.

The goal is simple: make Jellyfin feel more polished, more personal, and more premium — without cluttering the interface.

## Client Compatibility

JMSFusion works by injecting JavaScript and CSS into the **Jellyfin Web UI**.

Supported clients:

* Web browsers using Jellyfin Web
* Mobile clients that embed the Jellyfin Web client, such as **Jellyfin for Android** and **Jellyfin for iOS**

Not supported:

* **Jellyfin for Android TV** and other native TV clients that do not load the server's `jellyfin-web` frontend

In short: if the client does not render `/web/index.html`, JMSFusion cannot run there.

---

## Highlights

| Area        | What it adds                                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home screen | User-specific slider lists, automatic row refresh, custom API query control, manual positioning, and four slider layouts: Compact, Normal, Full Screen, and Peak |
| Discovery   | Details overlay, hover trailers, compact popover previews, personal recommendations, genre/director/recent rows, and studio hubs                                 |
| Metadata    | Quality badges, ratings, maturity indicators, richer info blocks, cast/director data, subtitle and language info, and provider links                             |
| Profiles    | Netflix-style profile chooser, avatar generation, and built-in avatar selection                                                                                  |
| Playback    | GMMP music player, lyrics support, subtitle customization, Netflix-style pause screen, parental PIN control, and Smart Pause                                     |

---

## Core Modules

* **Slider engine** with per-profile list control, random or manual content sourcing, API query customization, balancing rules, and automatic refresh logic
* **Visual layouts** including Compact, Normal, Full Screen, and Peak mode, with optional diagonal layout and manual positioning
* **Home enhancements** such as hero cards, enhanced details modal, recommendations, and metadata-rich UI elements
* **Hover preview system** with trailer playback and lightweight popover previews
* **Playback upgrades** including Smart Pause, metadata overlays, GMMP music playback, subtitle tools, and **parental PIN control**
* **Profile personalization** with avatar systems and fast profile switching
* **Library & notifications** including studio hubs, watchlist integration, and notification system
* **Trailer utilities** including trailer downloading via **yt-dlp** and trailer integration through **NFO files**
* **Advanced utilities** such as backup/restore, multilingual UI, and admin-level controls

---

## Installation

1. Open **Jellyfin Dashboard**
2. Go to **Plugins → Repositories**
3. Add:
```text
https://raw.githubusercontent.com/G-grbz/Jellyfin-MonWUI-Plugin/main/manifest.json
```
4. Go to **Plugins → Available**
5. Install **JMSFusion**
6. Restart Jellyfin

---

## Uninstall

1. Open **Jellyfin → Plugins**
2. Uninstall **JMSFusion**
3. Restart Jellyfin
4. Hard refresh (**Ctrl + F5 or Ctrl + Shift + R**)

---

## Notes

* After install/update, perform a hard refresh (**Ctrl + F5**)
* You may need to refresh a few times for all UI assets to fully update
* Android TV clients use a separate native UI and do not load the injected `jellyfin-web` assets, so JMSFusion features will not appear there
* Some advanced modules are optional and may require admin access, API keys, or server-side tools
* Hover videos for manually added studio collections can be sourced from YouTube. You can use Gharmonize as a tool: https://github.com/G-grbz/Gharmonize

- If you use Watchlist and want to hide the default Jellyfin Favorites tab, add the following CSS to the Jellyfin custom CSS area:
```text

  button.emby-tab-button.emby-button[data-index="1"] {
    display: none !important;
}
```
---

## Acknowledgment

The original idea behind the JMS slider concept — which influenced parts of JMSFusion — was created by **BobHasNoSoul**.

https://github.com/BobHasNoSoul

---

## License

Released under the **GPL-3.0 License**.
[LICENSE](LICENSE)


## Disclaimer

This software is provided "as is", without warranty of any kind. Use it at your own risk.
