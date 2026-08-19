<p align="center">
  <img src="https://github.com/user-attachments/assets/29947627-b2ff-4ecd-8a2b-4df932aca657" alt="JMSFusion logo" width="200" />
</p>

<p align="center">
  A modular UI upgrade for Jellyfin that introduces a cinematic home slider, richer metadata,
  hover previews, profile personalization, GMMP music playback, Netflix-style pause and details views,
  studio hubs, notifications, parental PIN control, and a centralized settings experience.
</p>

<p align="center">
  <img
    alt="Archived"
    src="https://img.shields.io/badge/Status-Archived-6b7280?style=for-the-badge"
  />

  <a href="https://github.com/G-grbz/Jellyfin-MonWUI-Plugin/blob/main/LICENSE">
    <img
      alt="License"
      src="https://img.shields.io/badge/License-GPLv3-7c3aed?style=for-the-badge"
    />
  </a>
</p>

---

> [!IMPORTANT]
> **This project has been archived and is no longer maintained.**
>
> No further updates, compatibility fixes, feature development, or active support are planned.
> Existing installations may continue to work, but compatibility with future Jellyfin releases is not guaranteed.

<p align="center">
  <a href="#overview">Overview</a> •
  <a href="#client-compatibility">Client Compatibility</a> •
  <a href="#highlights">Highlights</a> •
  <a href="#core-modules">Core Modules</a> •
  <a href="docs/seerr-arr-integration.md">Seerr & Arr Integration</a> •
  <a href="#uninstall">Uninstall</a> •
  <a href="#acknowledgment">Acknowledgment</a> •
  <a href="#license">License</a>
</p>

---

## Overview

**Jellyfin MonWUI Plugin**, displayed in Jellyfin as **JMSFusion**, is an all-in-one frontend enhancement layer built around a modular slider system located in `Resources/slider/`.

Rather than applying a single visual modification, JMSFusion expands the Jellyfin Web experience across home screen presentation, metadata, hover interactions, profile management, music playback, pause behavior, library discovery, notifications, and centralized UI configuration.

The project was designed to make Jellyfin feel more polished, personal, and cinematic while keeping the interface cohesive.

---

## Client Compatibility

JMSFusion works by injecting JavaScript and CSS into the **Jellyfin Web UI**.

### Compatible clients

* Web browsers using Jellyfin Web
* Mobile clients that embed the Jellyfin Web interface, including:

  * **Jellyfin for Android**
  * **Jellyfin for iOS**

### Not compatible

* **Jellyfin for Android TV**
* Native TV clients that do not load the server's `jellyfin-web` frontend
* Other clients using an independent native interface

In short, if a client does not render the server's `/web/index.html`, JMSFusion cannot modify its interface.

Because the project is archived, compatibility with newer Jellyfin server or client releases is not guaranteed.

---

## Highlights

| Area               | What it adds                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Home screen**    | User-specific slider lists, automatic row refresh, custom API query control, manual positioning, and Compact, Normal, Full Screen, and Peak slider layouts |
| **Discovery**      | Details overlays, hover trailers, compact popover previews, personal recommendations, genre/director/recent rows, and studio hubs                          |
| **Metadata**       | Quality badges, ratings, maturity indicators, richer information blocks, cast/director data, subtitle and language information, and provider links         |
| **Profiles**       | Netflix-style profile chooser, avatar generation, built-in avatar selection, and profile-specific customization                                            |
| **Playback**       | GMMP music player, lyrics support, subtitle customization, Netflix-style pause screen, parental PIN control, and Smart Pause                               |
| **Administration** | Centralized configuration, multilingual UI, backup/restore utilities, notifications, and admin-level controls                                              |

---

## Core Modules

* **Slider engine**

  * Per-profile list control
  * Random or manual content sourcing
  * Custom API queries
  * Content balancing rules
  * Automatic refresh logic

* **Visual layouts**

  * Compact
  * Normal
  * Full Screen
  * Peak
  * Optional diagonal presentation
  * Manual positioning controls

* **Home enhancements**

  * Cinematic hero presentation
  * Enhanced details views
  * Personal recommendations
  * Metadata-rich content cards
  * Custom home sections

* **Hover preview system**

  * Trailer playback
  * Lightweight popover previews
  * Expanded metadata presentation

* **Playback enhancements**

  * Smart Pause
  * Metadata overlays
  * GMMP music playback
  * Lyrics support
  * Subtitle customization
  * Parental PIN control

* **Profile personalization**

  * Netflix-style profile selection
  * Avatar generation
  * Built-in avatar library
  * Fast profile switching
  * Profile-specific preferences

* **Library and discovery**

  * Studio hubs
  * Watchlist integration
  * Genre and director discovery
  * Recently added content sections
  * Notification system

* **Trailer utilities**

  * Trailer downloading through `yt-dlp`
  * Trailer integration through NFO metadata
  * Hover video support

* **Advanced utilities**

  * Backup and restore
  * Multilingual interface
  * Centralized settings
  * Administrative controls

---

## Uninstall

For existing installations:

1. Open **Jellyfin Dashboard**
2. Go to **Plugins**
3. Uninstall **JMSFusion**
4. Restart Jellyfin
5. Hard refresh the Jellyfin Web interface using **Ctrl + F5** or **Ctrl + Shift + R**

If browser-cached JMSFusion assets remain visible after uninstalling, clear the Jellyfin site's cached data and reload the page.

---

## Acknowledgment

The original idea behind the **JMS slider concept**, which influenced parts of JMSFusion, was created by **BobHasNoSoul**.

https://github.com/BobHasNoSoul

---

## License

JMSFusion is released under the **GNU General Public License v3.0**.

See [LICENSE](LICENSE) for details.

---

## Disclaimer

This software is provided **"as is"**, without warranty of any kind.

The repository is preserved for historical, educational, and reference purposes. Since development has ended, users should not expect compatibility fixes for future Jellyfin releases.

Use at your own risk.
