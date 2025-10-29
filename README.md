## Jellyfin Media Slider
<img width="1920" height="931" alt="vt" src="https://github.com/user-attachments/assets/714fa44a-4713-4c19-ab33-b38806905a4c" />



An all-in-one JavaScript toolkit for Jellyfin, featuring a customizable Media Slider builder, music player, Netflix-style pause screen, Netflix-like HoverVideo, quality labels on cards, DiceBear avatar generator, and a sleek notification panel.

## 📑 Table of Contents

* [🖼️ Screenshots / Ekran Görüntüleri](#screenshots)
* [✨ Features / Özellikler](#features)
* [⚙️ Installation / Kurulum](#install)

  * [🇹🇷 Türkçe Kurulum](#tr-install)
  * [🇬🇧 English Installation](#en-install)
* [🎵 Synchronized Lyrics Script / Senkronize Şarkı Sözleri Betiği](#lyrics)

  * [🇹🇷 Türkçe Kullanım](#lyrics-tr)
  * [🇬🇧 English Usage](#lyrics-en)
* [🎬 Trailer Scripts / Fragman Betikleri](#trailers)

  * [🇬🇧 English Guide](#trailers-en)
  * [🇹🇷 Türkçe Rehber](#trailers-tr)
* [📄 License](#license)

---

<a id="screenshots"></a>

## 🖼️ Screenshots / Ekran Görüntüleri

|  |  |
|---|---|
| <div class="card"><img src="https://github.com/user-attachments/assets/d27f8ace-2645-4e2f-b2a1-3a370b9afb5b" alt="Vitrin Görünüm" width="100%"/><br/><sub><b>Vitrin Görünüm / Showcase View</b></sub></div> | <div class="card"><img src="https://github.com/user-attachments/assets/44ef2505-a51f-44d6-b731-d6d53c0b8330" alt="Diyagonal Vitrin Görünüm" width="100%"/><br/><sub><b>Diyagonal Vitrin Görünüm / Diagonal Showcase View</b></sub></div> |
| <div class="card"><img src="https://github.com/user-attachments/assets/446a97d7-2f4f-47c3-a360-c0c42b30b4ea" alt="Kompakt Görünüm" width="100%"/><br/><sub><b>Kompakt Görünüm / Compact View</b></sub></div> | <div class="card"><img src="https://github.com/user-attachments/assets/142da2c1-4225-41f1-8929-c0cd5345c03e" alt="Tam Ekran" width="100%"/><br/><sub><b>Tam Ekran / Full Screen</b></sub></div> |
| <div class="card"><img src="https://github.com/user-attachments/assets/c6a5dd52-9956-4846-8915-08ca7b42a8a0" alt="Normal Görünüm" width="100%"/><br/><sub><b>Normal Görünüm / Normal View</b></sub></div> | <div class="card"><img src="https://github.com/user-attachments/assets/dd74820e-f9fb-4f25-b442-a05388baeff3" alt="Duraklatma Ekranı" width="100%"/><br/><sub><b>Duraklatma Ekranı / Pause Screen</b></sub></div> |
| <div class="card"><img src="https://github.com/user-attachments/assets/557a9488-7114-457e-aebd-ab6bce72a486" alt="Bildirim Modalı" width="100%"/><br/><sub><b>Bildirim Modalı / Notification Modal</b></sub></div> | <div class="card"><img src="https://github.com/user-attachments/assets/2f226ae6-b80a-4f9a-a62e-70848f67da91" alt="Ayarlar Paneli" width="100%"/><br/><sub><b>Ayarlar Paneli / Settings Panel</b></sub></div> |
| <div class="card"><img src="https://github.com/user-attachments/assets/b67e7acd-39a5-420b-b341-379d4d471a69" alt="GMMP" width="100%"/><br/><sub><b>GMMP Müzik Oynatıcı / GMMP Music Player</b></sub></div> | <div class="card"><img src="https://github.com/user-attachments/assets/03acc238-92fa-4149-a3ad-5a32d792075f" alt="Yaş Rozeti" width="100%"/><br/><sub><b>Yaş Rozeti / Age Badge</b></sub></div> |
| <div class="card"><img src="https://github.com/user-attachments/assets/13549ae1-6afc-42e3-a6bd-73efc902f5d2" alt="HoverTrailers" width="100%"/><br/><sub><b>Hover Fragman / HoverTrailers</b></sub></div> | <div class="card"><img src="https://github.com/user-attachments/assets/7247488f-0b2a-47e6-8972-3be7f7e7c992" alt="Popovers" width="100%"/><br/><sub><b>Bilgi Balonları / Popovers</b></sub></div> |

---

<a id="features"></a>

## ✨ Features / Özellikler

### English

* Per-user list creation
* Automatic list updates
* Customizable Jellyfin API integration
* Manual positioning for theme compatibility
* GMMP Music Player
* Pause Screen
* Avatar Generator (DiceBear supported)
* Advanced settings management
* Global Quality Labels in Jellyfin
* Netflix-like Hover Video Previews
* Newly Added Content & Notifications Module
* StudioHubs (Disney+ style)
* Trailer Fetching Scripts

### Türkçe

* Her kullanıcı için ayrı liste oluşturma
* Otomatik liste güncelleme
* Özelleştirilebilir Jellyfin API entegrasyonu
* Manuel konumlandırma (tema uyumluluğu)
* GMMP Müzik Oynatıcı
* Duraklatma Ekranı
* Avatar Oluşturucu (DiceBear desteğiyle)
* Gelişmiş ayar yönetimi
* Jellyfin genelinde kalite etiketleri
* Netflix benzeri hover video önizlemeleri
* Yeni içerik ve sistem bildirim modülü
* StudioHubs (Disney+ tarzı)
* Fragman edinim betikleri

---

<a id="install"></a>

## ⚙️ Installation / Kurulum

<a id="tr-install"></a>

### 🇹🇷 Türkçe Kurulum

#### Eklenti olarak

* Jellyfin yönetici paneline giriş yapın.
* Eklentiler (Plugins) bölümüne gidin.
* Katalog (Catalog) sekmesine tıklayın.
* Üsteki ayar ikonuna tıklayarak + ikonu ile yeni kaynak ekle sayfasını açın ve aşağıdaki adresi ekleyin

```
https://raw.githubusercontent.com/G-grbz/Jellyfin-Media-Slider/main/manifest.json 
```

* Kaynağı kaydedin ve Katalog bölümünde JMSFusion eklentisini bulun ve yükleyin.
* JMS-Fusion yüklendikten sonra değişikliklerin geçerli olması için Jellyfin’i tekrar yeniden başlatın.
* Yeniden başlatma sonrası ana sayfaya dönüp bir kaç kez ctrl + f5 ile sayfayı yenileyin

#### Manuel Kurulum

##### Windows için

İndirdiğiniz sıkıştırılmış klasörü herhangi boş bir klasöre çıkarıp `install.bat` betiğini yönetici olarak çalıştırın ve tarayıcı çerezlerini birkaç kez temizleyin.

##### Yüklemeyi Kaldırma

`uninstall.bat` betiğini yönetici olarak çalıştırın.

##### Linux için

```bash
git clone https://github.com/G-grbz/Jellyfin-Media-Slider
cd Jellyfin-Media-Slider/Resources/slider/
```

##### Kurulum scriptini çalıştırın:

```bash
sudo chmod +x install.sh && sudo ./install.sh
```

##### Tarayıcı çerezlerini temizleyin.

##### Liste Güncelleme Scripti

listUpdate klasöründeki script belirli aralıklarla kullanıcı listelerini günceller.

##### Gerekli Ayarlar

`.env` dosyasını düzenleyerek gerekli bilgileri girin.

##### Script Seçenekleri

`updateList` içerikleri rastgele listeler (değerleri değiştirmek için `/modules/listConfig.json` el ile yapılandırılmalı ve script yeniden başlatılmalıdır.)

Detaylı açıklamalar:

* `itemLimit:` Slider'da gösterilecek maksimum öğe sayısı
* `garantiLimit:` Her içerik türünden garanti edilecek minimum öğe sayısı
* `listLimit:` Önceki listelerin saklanacağı maksimum sayı (tekrarları önlemek için)
* `listRefresh:` Listenin yenilenme aralığı (milisaniye - 300000ms = 5 dakika)
* `listcustomQueryString:` Jellyfin API'si için özel sorgu parametreleri

##### Script Çalıştırma

###### list ve listUpdate klasörüne okuma yazma izni verin

```bash
sudo chmod -R a+rw /usr/share/jellyfin/web/slider/list && sudo chmod -R a+rw /usr/share/jellyfin/web/slider/listUpdate
```

###### Gerekli bağımlılıkları yükleyin:

```bash
cd /usr/share/jellyfin/web/slider/listUpdate && npm install dotenv node-fetch
```

###### scripti çalıştırın:

```bash
node updateList.mjs
```

###### Yüklemeyi Kaldırma

```bash
sudo chmod +x /usr/share/jellyfin/web/slider/uninstall.sh && sudo sh /usr/share/jellyfin/web/slider/uninstall.sh
```

<a id="en-install"></a>

### 🇬🇧 English Installation

#### Installation with a plugin

* Log in to your Jellyfin admin dashboard.
* Go to the Plugins section.
* Click on the Catalog tab.
* Click the settings icon at the top, then use the + button to open the “Add Repository” page and enter the following address:

```
https://raw.githubusercontent.com/G-grbz/Jellyfin-Media-Slider/main/manifest.json
```

* Save the repository, then go to the Catalog section, find the JMS-Fusion plugin, and install it.
* After installing JMS-Fusion, restart Jellyfin again to apply the changes.
* After restarting, go back to the home page and refresh the page with ctrl + f5 a few times.

#### Manual Installation

##### For Windows

Extract the downloaded compressed folder to any empty folder, then run the `install.bat` file as administrator and clear your browser cookies a few times.

##### Uninstalling

Run the script `uninstall.bat` as administrator.

##### For Linux

```bash
git clone https://github.com/G-grbz/Jellyfin-Media-Slider
cd Jellyfin-Media-Slider/Resources/slider/
```

##### Run the installation script:

```bash
sudo chmod +x install.sh && sudo ./install.sh
```

##### Clear browser cookies to ensure the changes take effect.

##### List Update Script

The script in the listUpdate folder updates user lists at specific intervals.

##### Required Settings

Edit the .env file and insert the necessary information.

##### Script Options

`updateList` lists the contents randomly (`/modules/listConfig.json` needs to be configured manually and the script needs to be restarted for the changes to take effect.)

Detailed explanations:

* `itemLimit:` Maximum number of items to show in slider
* `garantiLimit:` Minimum guaranteed items per content type (Movie/Series/BoxSet)
* `listLimit:` Max number of previous lists to store (prevent duplicates)
* `listRefresh:` Refresh interval in milliseconds (300000ms = 5 minutes)
* `listcustomQueryString:` Custom query parameters for Jellyfin API

##### Running the Script

###### Give read-write permission to the list and listUpdate folder

```bash
sudo chmod -R a+rw /usr/share/jellyfin/web/slider/list && sudo chmod -R a+rw /usr/share/jellyfin/web/slider/listUpdate
```

###### Install dependencies:

```bash
cd /usr/share/jellyfin/web/slider/listUpdate && npm install dotenv node-fetch
```

###### Run the script:

```bash
node updateList.mjs
```

###### Uninstallation

```bash
sudo chmod +x /usr/share/jellyfin/web/slider/uninstall.sh && sudo sh /usr/share/jellyfin/web/slider/uninstall.sh
```

---

<a id="lyrics"></a>

## 🎵 Synchronized Lyrics Script / Senkronize Şarkı Sözleri Betiği

<a id="lyrics-tr"></a>

### 🇹🇷 Türkçe

`lrclib.net` üzerinden şarkı sözlerini çekebilen bir betik ekledim (`lrclib.sh`). Bu betik eklentiden bağımsız olarak çalışmaktadır. (Linux)

**Bağımlılıklar:** `curl`, `jq`, `find`

**Dosya adı formatı:** `'sanatçı' - 'parça adı'` (Örn: `Ali Kınık - Ali Ayşeyi Seviyor`)

**Kullanım:**

```bash
curl -fsSL -o trailers.sh "https://raw.githubusercontent.com/G-grbz/Jellyfin-Media-Slider/main/Resources/slider/lrclib.sh"
chmod +x lrclib.sh
```

```bash
sh lrclib.sh /Müzik/Dosya/Yolu
```

Mevcut sözlerin üzerine yazmak için:

```bash
sh lrclib.sh /Müzik/Dosya/Yolu --overwrite
```

Yol boşluk içeriyorsa:

```bash
sh lrclib.sh "/Müzik/Dosya/Müzik Yolu" --overwrite
```

(Desteklenen biçimler: `mp3`, `flac`)

<a id="lyrics-en"></a>

### 🇬🇧 English

A standalone script to fetch synchronized lyrics from `lrclib.net` (`lrclib.sh`). Works independently of the plugin (Linux).

**Requirements:** `curl`, `jq`, `find`

**Track filename format:** `'artist' - 'track title'` (e.g., `Ali Kınık - Ali Ayşeyi Seviyor`)

**Usage:**

```bash
curl -fsSL -o trailers.sh "https://raw.githubusercontent.com/G-grbz/Jellyfin-Media-Slider/main/Resources/slider/lrclib.sh"
chmod +x lrclib.sh
```

```bash
sh lrclib.sh /Path/To/Your/Music/Directory
```

Overwrite existing lyrics:

```bash
sh lrclib.sh /Path/To/Your/Music/Directory --overwrite
```

Paths with spaces:

```bash
sh lrclib.sh "/Path/To/Your/Music Path" --overwrite
```

(Supported formats: `mp3`, `flac`)

---

<a id="trailers"></a>

## 🎬 Trailer Scripts / Fragman Betikleri

<a id="trailers-en"></a>

### 🇬🇧 English

This repository contains **two related scripts** for adding trailers to your Jellyfin media library:

* `trailers.sh` → Downloads and saves **local MP4 trailers** using `yt-dlp`.
* `trailersurl.sh` → Adds only a **trailer URL** into NFO metadata files (trailersurl.sh does not perform downloads. For it to work, you need to have NFO enabled in your Jellyfin library, and the content folders must already contain pre-generated NFO files.).

Both use TMDb for trailer discovery and refresh Jellyfin metadata afterward.

#### Which one should I use?

* Use `trailers.sh` if you want **offline, locally stored MP4 trailers** (more disk usage, but reliable even without internet).
* Use `trailersurl.sh` if you prefer **fast, lightweight setup with no downloads**, but note: trailers will stream online and need internet at playback.

#### Features

* Movie and TV (Series/Season/Episode) support
* Multi‑language trailer discovery (preferred + fallback)
* Metadata refresh after adding trailer (either file or URL)
* Summary report with counts (downloaded/skipped/errors or NFO updated/skipped/errors)

#### Requirements

Common dependencies:

* **Shell**: bash (Linux/macOS)
* **Tools**: `curl`, `jq`

Additional for `trailers.sh`:

* `yt-dlp` (required)
* `ffprobe` (optional, from `ffmpeg`)

#### Installation

Choose your distro and run:

(Note: It is recommended to install yt-dlp via pip. Using pip instead of a package manager ensures you get the latest version and a smoother experience.)

**Debian / Ubuntu**

```bash
sudo apt update
sudo apt install -y curl jq ffmpeg yt-dlp
```

**Arch / Manjaro**

```bash
sudo pacman -S curl jq ffmpeg yt-dlp
```

**Fedora**

```bash
sudo dnf install -y curl jq ffmpeg yt-dlp
```

**openSUSE**

```bash
sudo zypper install -y curl jq ffmpeg yt-dlp
```

**Alpine**

```bash
sudo apk add curl jq ffmpeg yt-dlp
```

#### Get the scripts

```bash
curl -fsSL -o trailers.sh "https://raw.githubusercontent.com/G-grbz/Jellyfin-Media-Slider/main/Resources/slider/trailers.sh"
curl -fsSL -o trailersurl.sh "https://raw.githubusercontent.com/G-grbz/Jellyfin-Media-Slider/main/Resources/slider/trailersurl.sh"
chmod +x trailers.sh trailersurl.sh
```

#### Configuration

Both scripts use environment variables. Common ones:

---

## Environment Variables Reference

| Variable                    | Default                                                            | Description / Allowed Values                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JF_BASE`                   | `http://localhost:8096`                                            | Jellyfin server base URL.                                                                                                                           |
| `JF_API_KEY`                | `CHANGE_ME`                                                        | **Required.** Jellyfin API key.                                                                                                                     |
| `TMDB_API_KEY`              | `CHANGE_ME`                                                        | **Required.** TMDb API key.                                                                                                                         |
| `PREFERRED_LANG`            | `tr-TR`                                                            | Preferred language code for TMDb lookups.                                                                                                           |
| `FALLBACK_LANG`             | `en-US`                                                            | Fallback language code if preferred is unavailable.                                                                                                 |
| `INCLUDE_TYPES`             | `Movie,Series,Season,Episode`                                      | Media types to scan from Jellyfin.                                                                                                                  |
| `PAGE_SIZE`                 | `200`                                                              | Pagination size for Jellyfin `/Items` queries.                                                                                                      |
| `JF_USER_ID`                | *(empty)*                                                          | Jellyfin user ID. If unset, the script auto-detects an administrator or first user.                                                                 |
| `INCLUDE_LANGS_WIDE`        | `tr,en,hi,de,ru,fr,it,es,ar,fa,pt,zh,ja,ko,nl,pl,sv,cs,uk,el,null` | Broad set of fallback languages for TMDb trailer search when preferred/fallback fails.                                                              |
| `PREFERRED_ISO639`          | derived from `PREFERRED_LANG`                                      | Auto-extracted ISO 639-1 code from preferred language (e.g., `tr-TR` → `tr`). Not typically set manually.                                           |
| `FALLBACK_ISO639`           | derived from `FALLBACK_LANG`                                       | Auto-extracted ISO 639-1 code from fallback language (e.g., `en-US` → `en`). Not typically set manually.                                            |

---

Extra for `trailers.sh`:

* `COOKIES_BROWSER` → Default `(empty)` : Browser to export cookies from for yt-dlp (e.g., firefox, chrome:Default, edge, safari). Useful for age-restricted or region-locked videos.
* `MIN_FREE_MB`  → Default `1024` : Minimum required free space (MiB) in both destination and working directory before downloads are attempted.
* `SLEEP_SECS` → Default `1` : Delay (seconds) after each successful download.
* `MIN_FREE_MB` → Default `1024` : Minimum required free space (MiB) in both destination and working directory before downloads are attempted.
* `CLEANUP_EXTRA_PATHS` → Default *(empty)* : Extra root paths (colon-separated) to clean temp files from.
* `WORK_DIR` → Default `/tmp/trailers-dl` : Working directory for temporary downloads. 
* `ENABLE_THEME_LINK` → Default `0` : If the value is `1`, the downloaded `trailer.mp4` file will be used to create a `theme.mp4` inside the newly created `backdrops/` directory, either as a symbolic link, hard link, or copy, depending on the chosen option.
* `THEME_LINK_MODE` → Default `symlink` : Mode for theme creation. Options: `symlink`, `hardlink`, `copy`.
* `OVERWRITE_POLICY` → Default `skip` : Behavior when `trailer.mp4` already exists. Values: `skip`, `replace`, `if-better`.
* `BETTER_MIN_SIZE_DELTA` → Default `1048576` : In `if-better` mode: new trailer must be at least this many bytes larger to count as better.
* `BETTER_MIN_DURATION_DELTA` → Default `3` : In `if-better` mode: new trailer must be longer by at least this many seconds to count as better.

## Notes

* **`OVERWRITE_POLICY=if-better`** logic: the new trailer is kept only if it is longer (`BETTER_MIN_DURATION_DELTA`) **or** larger (`BETTER_MIN_SIZE_DELTA`) than the existing one.
* **Theme file (`backdrops/theme.mp4`)**: Enabled with `ENABLE_THEME_LINK=1`, created using the chosen method in `THEME_LINK_MODE`.
* **`COOKIES_BROWSER`** example: `COOKIES_BROWSER=firefox` or `COOKIES_BROWSER="chrome:Default"` to use yt-dlp with authenticated sessions.
---

#### Usage

**Download trailers (trailers.sh):**

```bash
JF_BASE="http://jellyfinserveraddress:8096" \
JF_API_KEY="API-KEY-HERE" \
TMDB_API_KEY="TMDB-API-KEY-HERE" \
COOKIES_BROWSER=chrome \
MIN_FREE_MB=2048 \
OVERWRITE_POLICY= if-better \
ENABLE_THEME_LINK=1 \
PREFERRED_LANG=tr-TR \
INCLUDE_LANGS_WIDE="tr,en,hi,de,ru,fr,it,es,ar,fa,pt,zh,ja,ko,null" \
./trailers.sh
```

**Add only trailer URLs (trailersurl.sh):**

```bash
JF_BASE="http://jellyfinserveraddress:8096" \
JF_API_KEY="API-KEY-HERE" \
TMDB_API_KEY="TMDB-API-KEY-HERE" \
PREFERRED_LANG=tr-TR \
INCLUDE_LANGS_WIDE="tr,en,hi,de,ru,fr,it,es,ar,fa,pt,zh,ja,ko,null" \
./trailersurl.sh
```

#### Systemd timer (optional)

Create a service at `/etc/systemd/system/trailers.service`:

```ini
[Unit]
Description=Download trailers for Jellyfin library

[Service]
Type=oneshot
Environment=JF_BASE=http://localhost:8096
Environment=JF_API_KEY=<JF_API-KEY>
Environment=TMDB_API_KEY=<TMDB_API-KEY>
Environment=PREFERRED_LANG=tr-TR
Environment=COOKIES_BROWSER=chrome
Environment=INCLUDE_LANGS_WIDE=tr,en,hi,de,ru,fr,it,es,ar,fa,pt,zh,ja,ko,null
WorkingDirectory=/opt/trailers(replace this with the directory path where the scripts are located)
ExecStart=/directory-path/trailers.sh
```

Timer `/etc/systemd/system/trailers.timer`:

```ini
[Unit]
Description=Run trailers.sh daily

[Timer]
OnCalendar=03:30
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now trailers.timer
```

---

<a id="trailers-tr"></a>

### 🇹🇷 Türkçe

Bu repo Jellyfin kütüphanenize fragman eklemek için **iki betik** içerir:

* `trailers.sh` → `yt-dlp` ile **yerel MP4 fragmanları** indirir.
* `trailersurl.sh` → Sadece **fragman URL’sini** `.nfo` dosyasına ekler (İndirme işlemi yapmaz. Bunun çalışabilmesi için Jellyfin kütüphanenizde NFO etkin olmalı ve içerik klasörlerinde önceden oluşturulmuş NFO dosyaları bulunmalıdır).

Her ikisi de TMDb üzerinden fragman arar ve işlem sonrası Jellyfin meta verisini yeniler.

#### Hangisini kullanmalı?

* `trailers.sh` → **İnternetsiz çalışabilen yerel MP4 dosyaları** istiyorsanız kullanın (daha fazla disk kullanır).
* `trailersurl.sh` → **Hafif ve hızlı** çözüm istiyorsanız kullanın (disk kullanmaz ama oynatma için internet gerekir).

#### Özellikler

* Film ve Dizi (Dizi/Sezon/Bölüm) desteği
* Tercihli/yedek dil ile çoklu dil desteği
* Fragman eklendikten sonra meta veri yenileme
* Özet rapor (indirilen/atlanılan/hatalı ya da NFO güncellenen/atlanılan)

#### Gerekli Araçlar

Ortak bağımlılıklar:

* **Kabuk**: bash
* **Araçlar**: `curl`, `jq`

Ek olarak `trailers.sh` için:

* `yt-dlp` (zorunlu)
* `ffprobe` (`ffmpeg` paketinden, opsiyonel)

#### Kurulum

Dağıtımınıza göre:

(not: yt-dlp kurulumunu pip üzerinden yapmanız tavsiye edilir. Paket yöneticileriyle kurulum yerine pip kullanmanız daha güncel ve sorunsuz bir deneyim sağlayacaktır.)

**Debian / Ubuntu**

```bash
sudo apt update
sudo apt install -y curl jq ffmpeg yt-dlp
```

**Arch / Manjaro**

```bash
sudo pacman -S curl jq ffmpeg yt-dlp
```

**Fedora**

```bash
sudo dnf install -y curl jq ffmpeg yt-dlp
```

**openSUSE**

```bash
sudo zypper install -y curl jq ffmpeg yt-dlp
```

**Alpine**

```bash
sudo apk add curl jq ffmpeg yt-dlp
```

#### Betikleri indir

```bash
curl -fsSL -o trailers.sh "https://raw.githubusercontent.com/G-grbz/Jellyfin-Media-Slider/main/Resources/slider/trailers.sh"
curl -fsSL -o trailersurl.sh "https://raw.githubusercontent.com/G-grbz/Jellyfin-Media-Slider/main/Resources/slider/trailersurl.sh"
chmod +x trailers.sh trailersurl.sh
```

#### Yapılandırma

---

## Ortam Değişkenleri Referansı

| Değişken                    | Varsayılan                                                         | Açıklama / Geçerli Değerler                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JF_BASE`                   | `http://localhost:8096`                                            | Jellyfin sunucu adresi.                                                                                                                            |
| `JF_API_KEY`                | `CHANGE_ME`                                                        | **Zorunlu.** Jellyfin API anahtarı.                                                                                                                |
| `TMDB_API_KEY`              | `CHANGE_ME`                                                        | **Zorunlu.** TMDb API anahtarı.                                                                                                                    |
| `PREFERRED_LANG`            | `tr-TR`                                                            | TMDb sorguları için tercih edilen dil kodu.                                                                                                        |
| `FALLBACK_LANG`             | `en-US`                                                            | Tercih edilen dil bulunmazsa kullanılacak yedek dil.                                                                                               |
| `INCLUDE_TYPES`             | `Movie,Series,Season,Episode`                                      | Jellyfin’de taranacak medya türleri.                                                                                                               |
| `PAGE_SIZE`                 | `200`                                                              | Jellyfin `/Items` sayfalama boyutu.                                                                                                                |
| `JF_USER_ID`                | *(boş)*                                                            | Jellyfin kullanıcı ID’si. Ayarlanmazsa script otomatik yönetici veya ilk kullanıcıyı çözer.                                                        |
| `INCLUDE_LANGS_WIDE`        | `tr,en,hi,de,ru,fr,it,es,ar,fa,pt,zh,ja,ko,nl,pl,sv,cs,uk,el,null` | TMDb trailer aramalarında geniş dil havuzu. Tercih/yedek dil sonuç vermezse devreye girer.                                                         |
| `PREFERRED_ISO639`          | `PREFERRED_LANG`’den türetilir                                     | Otomatik çıkarılır (`tr-TR` → `tr`). Manuel ayarlamaya gerek yok.                                                                                  |
| `FALLBACK_ISO639`           | `FALLBACK_LANG`’den türetilir                                      | Otomatik çıkarılır (`en-US` → `en`). Manuel ayarlamaya gerek yok.                                                                                  |

---

Ekstra `trailers.sh` için:

* `COOKIES_BROWSER` → varsayılan `(boş)` : yt-dlp için çerezlerin alınacağı tarayıcı (örn. firefox, chrome:Default, edge, safari). Yaş kısıtlı veya bölge kilitli videolarda faydalı.
* `MIN_FREE_MB` → varsayılan `1024` : Hem hedef hem de çalışma klasöründe olması gereken minimum boş alan (MiB). Altındaysa indirme yapılmaz.
* `SLEEP_SECS ` → varsayılan `1` : Başarılı her indirmeden sonra beklenecek saniye.
* `OVERWRITE_POLICY` → varsayılan `skip` : Var olan `trailer.mp4` dosyası için davranış. Değerler: `skip`, `replace`, `if-better`.                              
* `WORK_DIR` → varsayılan`/tmp/trailers-dl` : Geçici indirme klasörü.                                                                                            
* `ENABLE_THEME_LINK` → varsayılan `0` : Değer `1` ise, indirilen `trailer.mp4` dosyası, yeni oluşturulacak `backdrops/` dizininin içine theme.mp4 eklemek için seçime göre sembolik bağlantı, sabit bağlantı veya kopya oluşturur.                              
* `THEME_LINK_MODE` → varsayılan `symlink` : Tema dosyası oluşturma yöntemi: `symlink`, `hardlink`, `copy`.                                                      
* `CLEANUP_EXTRA_PATHS` → *(boş)* : Ek temizlenecek klasör kökleri. Birden çok yol `:` ile ayrılabilir. 
* `BETTER_MIN_SIZE_DELTA` → `1048576` : `if-better` modunda: yeni dosya en az bu kadar bayt daha büyükse “daha iyi” kabul edilir.
* `BETTER_MIN_DURATION_DELTA` → `3` : `if-better` modunda: yeni dosya en az bu kadar saniye daha uzunsa “daha iyi” kabul edilir.             

## Notlar

* **`OVERWRITE_POLICY=if-better`** mantığı: Yeni trailer, süresi `BETTER_MIN_DURATION_DELTA` kadar daha uzunsa **veya** boyutu `BETTER_MIN_SIZE_DELTA` kadar daha büyükse kabul edilir.
* **Tema dosyası (`backdrops/theme.mp4`)**: `ENABLE_THEME_LINK=1` ile etkinleştirilir, `THEME_LINK_MODE` yöntemine göre oluşturulur.
* **`COOKIES_BROWSER`** örnek: `COOKIES_BROWSER=firefox` veya `COOKIES_BROWSER="chrome:Default"`.

---


#### Örnek Kullanım

**Fragman indir (trailers.sh):**

```bash
JF_BASE="http://jellyfinserveradres:8096" \
JF_API_KEY="API-KEY-BURAYA" \
TMDB_API_KEY="TMDB-API-KEY-BURAYA" \
COOKIES_BROWSER=chrome \
MIN_FREE_MB=2048 \
ENABLE_THEME_LINK=1 \
PREFERRED_LANG=tr-TR \
OVERWRITE_POLICY=if-better \
INCLUDE_LANGS_WIDE="tr,en,hi,de,ru,fr,it,es,ar,fa,pt,zh,ja,ko,null" \
./trailers.sh
```

**Sadece URL ekle (trailersurl.sh):**

```bash
JF_BASE="http://jellyfinserveradres:8096" \
JF_API_KEY="API-KEY-BURAYA" \
TMDB_API_KEY="TMDB-API-KEY-BURAYA" \
PREFERRED_LANG=tr-TR \
INCLUDE_LANGS_WIDE="tr,en,hi,de,ru,fr,it,es,ar,fa,pt,zh,ja,ko,null" \
./trailersurl.sh
```

#### Systemd zamanlayıcı (opsiyonel)

`/usr/lib/systemd/system/trailers.service`:

```ini
[Unit]
Description=Jellyfin kütüphanesi için fragman indirme

[Service]
Type=oneshot
Environment=JF_BASE=http://localhost:8096
Environment=JF_API_KEY=<JF_ANAHTAR>
Environment=TMDB_API_KEY=<TMDB_ANAHTAR>
Environment=PREFERRED_LANG=tr-TR
Environment=COOKIES_BROWSER=chrome
Environment=INCLUDE_LANGS_WIDE=tr,en,hi,de,ru,fr,it,es,ar,fa,pt,zh,ja,ko,null
WorkingDirectory=/opt/trailers(burayı betiklerin bulunduğu dizin yolu ile değiştirin)
ExecStart=/dizin-yolu/trailers.sh
```

`/usr/lib/systemd/system/trailers.timer`:

```ini
[Unit]
Description=trailers.sh günlük çalıştırma

[Timer]
OnCalendar=03:30
Persistent=true

[Install]
WantedBy=timers.target
```

Etkinleştir:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now trailers.timer
```

---

<a id="license"></a>

## 📄 License (MIT)

This project is licensed under the MIT License.

You are free to use, copy, modify, merge, publish, and distribute this software, provided that:

You credit the original author clearly.

A link to the original repository is included when possible.

Any modifications or changes are clearly indicated.

This software is provided “as is”, without warranty of any kind.
Use it at your own responsibility.
