#!/usr/bin/env bash
# ==============================================================================
#  The use of this file without proper attribution to the original author (G-grbz - https://github.com/G-grbz)
#  and without obtaining permission is considered unethical and is not permitted.
# ==============================================================================
# Copyright (c) 2025 G-grbz. All rights reserved.
# ==============================================================================
set -euo pipefail
export LC_ALL=C

VERSION="trailers.sh v2.3 (URL parity, original download, summary)"
echo "[INFO] $VERSION" >&2
[[ "${BASH:-}" ]] || { echo "[HATA] Bu script bash gerektirir. 'bash trailers.sh' ile çalıştır." >&2; exit 2; }

JF_BASE="${JF_BASE:-http://localhost:8096}"
JF_API_KEY="${JF_API_KEY:-CHANGE_ME}"
TMDB_API_KEY="${TMDB_API_KEY:-CHANGE_ME}"
PREFERRED_LANG="${PREFERRED_LANG:-tr-TR}"
FALLBACK_LANG="${FALLBACK_LANG:-en-US}"
INCLUDE_TYPES="${INCLUDE_TYPES:-Movie,Series,Season,Episode}"
PAGE_SIZE="${PAGE_SIZE:-200}"
SLEEP_SECS="${SLEEP_SECS:-1}"
JF_USER_ID="${JF_USER_ID:-}"
OVERWRITE_POLICY="${OVERWRITE_POLICY:-skip}"
BETTER_MIN_SIZE_DELTA="${BETTER_MIN_SIZE_DELTA:-1048576}"
BETTER_MIN_DURATION_DELTA="${BETTER_MIN_DURATION_DELTA:-3}"
ENABLE_THEME_LINK="${ENABLE_THEME_LINK:-0}"
THEME_LINK_MODE="${THEME_LINK_MODE:-symlink}"

COOKIES_BROWSER="${COOKIES_BROWSER:-}"
WORK_DIR="${WORK_DIR:-/tmp/trailers-dl}"
CLEANUP_EXTRA_PATHS="${CLEANUP_EXTRA_PATHS:-}"
MIN_FREE_MB="${MIN_FREE_MB:-1024}"
INCLUDE_LANGS_WIDE="${INCLUDE_LANGS_WIDE:-tr,en,hi,de,ru,fr,it,es,ar,fa,pt,zh,ja,ko,nl,pl,sv,cs,uk,el,null}"
PREFERRED_ISO639="${PREFERRED_LANG%%-*}"
FALLBACK_ISO639="${FALLBACK_LANG%%-*}"

need() { command -v "$1" >/dev/null || { echo "Hata: $1 kurulu değil." >&2; exit 1; }; }
need curl; need jq; need yt-dlp
command -v ffprobe >/dev/null || echo "Uyarı: ffprobe yok; süre/boyut kontrolleri sınırlı olur." >&2

[[ "$JF_API_KEY" != "CHANGE_ME" && "$TMDB_API_KEY" != "CHANGE_ME" ]] \
  || { echo "Hata: JF_API_KEY ve TMDB_API_KEY ayarla." >&2; exit 1; }

api() { curl -sS --fail "$@"; }
get_free_mb() { df -Pm "$1" | awk 'NR==2{print $4}'; }

mkdir -p "$WORK_DIR" 2>/dev/null || {
  echo "[HATA] WORK_DIR oluşturulamadı: $WORK_DIR" >&2; exit 1;
}

ensure_backdrops_theme() {
  local dir="$1"; local trailer="$2"
  local bd="$dir/backdrops"
  local theme="$bd/theme.mp4"
  [[ "${ENABLE_THEME_LINK:-0}" -eq 1 ]] || return 0

  mkdir -p "$bd" 2>/dev/null || {
    echo "[WARN] backdrops klasörü oluşturulamadı: $bd" >&2
    return 1
  }

  if [[ -e "$theme" || -L "$theme" ]]; then
    return 0
  fi

  local rel="../$(basename "$trailer")"

  case "$THEME_LINK_MODE" in
    symlink)
      if ln -s "$rel" "$theme" 2>/dev/null || ln -s "$trailer" "$theme" 2>/dev/null; then
        echo "[OK] theme.mp4 için symlink oluşturuldu (mode=symlink): $theme -> $trailer"
      elif ln "$trailer" "$theme" 2>/dev/null; then
        echo "[OK] symlink mümkün değil, hardlink fallback kullanıldı (mode=symlink): $theme"
      else
        echo "[WARN] Symlink/hardlink oluşturulamadı, theme.mp4 atlanıyor (mode=symlink)." >&2
        return 1
      fi
      ;;

    hardlink)
      if ln "$trailer" "$theme" 2>/dev/null; then
        echo "[OK] theme.mp4 için hardlink oluşturuldu (mode=hardlink): $theme"
      elif ln -s "$rel" "$theme" 2>/dev/null || ln -s "$trailer" "$theme" 2>/dev/null; then
        echo "[OK] hardlink mümkün değil, symlink fallback kullanıldı (mode=hardlink): $theme"
      else
        echo "[WARN] Hardlink/symlink oluşturulamadı, theme.mp4 atlanıyor (mode=hardlink)." >&2
        return 1
      fi
      ;;

    copy|*)
      if cp -f "$trailer" "$theme" 2>/dev/null; then
        echo "[OK] theme.mp4 kopyalandı (mode=copy): $theme"
      else
        echo "[WARN] copy mode: theme.mp4 kopyalanamadı: $theme" >&2
        return 1
      fi
      ;;
  esac

  if [[ -e "$theme" || -L "$theme" ]]; then
    echo "[OK] backdrops/theme.mp4 hazırlandı → $(readlink -f "$theme" 2>/dev/null || echo "$theme")"
  else
    echo "[WARN] theme.mp4 oluşturulamadı: $theme" >&2
    return 1
  fi
}

declare -i DL_OK=0 DL_FAIL=0 DL_SKIP=0

resolve_user_id() {
  [[ -n "${JF_USER_ID:-}" ]] && { echo "$JF_USER_ID"; return 0; }
  local users; users=$(api -H "X-Emby-Token: $JF_API_KEY" "$JF_BASE/Users") || return 1
  local uid; uid=$(echo "$users" | jq -r '[.[] | select(.Policy.IsAdministrator==true)][0].Id // .[0].Id // empty')
  [[ -n "$uid" ]] || { echo "[HATA] Kullanıcı bulunamadı." >&2; return 2; }
  echo "$uid"
}

imdb_to_tmdb() {
  local imdb_id="$1" kind_hint="${2:-Unknown}"
  local r; r=$(api "https://api.themoviedb.org/3/find/${imdb_id}?api_key=${TMDB_API_KEY}&external_source=imdb_id") || return 1
  local mid tv
  mid=$(echo "$r" | jq -r '.movie_results[0].id // empty')
  tv=$(echo "$r" | jq -r '.tv_results[0].id // empty')
  if [[ -n "$mid" && ( "$kind_hint" == "Movie" || "$kind_hint" == "Unknown" ) ]]; then echo "Movie:$mid"; return 0; fi
  if [[ -n "$tv" && ( "$kind_hint" == "Series" || "$kind_hint" == "Unknown" ) ]]; then echo "Series:$tv"; return 0; fi
  [[ -n "$mid" ]] && { echo "Movie:$mid"; return 0; }
  [[ -n "$tv" ]] && { echo "Series:$tv"; return 0; }
  return 2
}

OVERWRITE_POLICY="${OVERWRITE_POLICY:-skip}"
echo "[INFO] OVERWRITE_POLICY runtime = '$OVERWRITE_POLICY'" >&2

while [[ $# -gt 0 ]]; do
  case "$1" in
    --overwrite=*)
      OVERWRITE_POLICY="${1#*=}"; shift ;;
    --overwrite)
      OVERWRITE_POLICY="replace"; shift ;;
    --no-overwrite)
      OVERWRITE_POLICY="skip"; shift ;;
    *)
      echo "[WARN] Bilinmeyen argüman: $1" >&2; shift ;;
  esac
done

case "$OVERWRITE_POLICY" in
  skip|replace|if-better) : ;;
  *) echo "[HATA] OVERWRITE_POLICY geçersiz: $OVERWRITE_POLICY (skip|replace|if-better)" >&2; exit 2 ;;
esac

jq_trailer_defs='
  def ytid:
    tostring
    | if test("^[A-Za-z0-9_-]{11}$") then .
      elif test("[\\?&]v=([A-Za-z0-9_-]{11})") then capture("[\\?&]v=(?<id>[A-Za-z0-9_-]{11})").id
      elif test("youtu\\.be/([A-Za-z0-9_-]{11})") then capture("youtu\\.be/(?<id>[A-Za-z0-9_-]{11})").id
      else empty end;
  def vimeoid:
    tostring
    | if test("^[0-9]+$") then .
      elif (match("([0-9]{6,})")? != null) then (match("([0-9]{6,})").captures[0].string)
      else empty end;
  def filt:
    (.results // [])
    | map(select((.site|ascii_downcase)=="youtube" or (.site|ascii_downcase)=="vimeo"))
    | ( ( map(select((.type|ascii_downcase)=="trailer"))
          + map(select((.type|ascii_downcase)=="teaser")) ) )
    | map({ site:(.site|ascii_downcase), key_raw:(.key|tostring // "") })
    | map(if .site=="youtube" then . + {key:(.key_raw|ytid)}
          elif .site=="vimeo" then . + {key:(.key_raw|vimeoid)}
          else . + {key:""} end)
    | map(select(.key != null and (.key|type)=="string" and (.key|length)>0))
    | map("\(.site)|\(.key)")
    | reduce .[] as $x ([]; if (index($x)) then . else . + [$x] end)
    | .[] ;
'

find_trailer_keys_movie() {
  local tmdb_id="$1"
  local base="api_key=${TMDB_API_KEY}&language=${PREFERRED_LANG}&include_video_language=${PREFERRED_ISO639},${FALLBACK_ISO639},en,null"
  local r; r=$(api "https://api.themoviedb.org/3/movie/${tmdb_id}/videos?${base}" 2>/dev/null || echo '{"results":[]}')
  local lines; lines=$(printf '%s' "$r" | jq -r "$jq_trailer_defs filt" 2>/dev/null || echo '')
  [[ -n "$lines" ]] && { printf '%s\n' "$lines"; return 0; }
  r=$(api "https://api.themoviedb.org/3/movie/${tmdb_id}/videos?api_key=${TMDB_API_KEY}&language=${PREFERRED_LANG}&include_video_language=${INCLUDE_LANGS_WIDE}" 2>/dev/null || echo '{"results":[]}')
  printf '%s' "$r" | jq -r "$jq_trailer_defs filt" || true
}

find_trailer_keys_tv() {
  local tv_id="$1" season_no="${2:-}" episode_no="${3:-}"
  local base_params="api_key=${TMDB_API_KEY}&language=${PREFERRED_LANG}&include_video_language=${PREFERRED_ISO639},${FALLBACK_ISO639},en,null"
  if [[ -n "$episode_no" && -n "$season_no" ]]; then
    local url="https://api.themoviedb.org/3/tv/${tv_id}/season/${season_no}/episode/${episode_no}/videos?${base_params}"
    local r; r=$(api "$url" 2>/dev/null || echo '{"results":[]}')
    local lines; lines=$(printf '%s' "$r" | jq -r "$jq_trailer_defs filt" 2>/dev/null || echo '')
    [[ -n "$lines" ]] && { printf '%s\n' "$lines"; return 0; }
  fi

  if [[ -n "$season_no" ]]; then
    local url="https://api.themoviedb.org/3/tv/${tv_id}/season/${season_no}/videos?${base_params}"
    local r; r=$(api "$url" 2>/dev/null || echo '{"results":[]}')
    local lines; lines=$(printf '%s' "$r" | jq -r "$jq_trailer_defs filt" 2>/dev/null || echo '')
    [[ -n "$lines" ]] && { printf '%s\n' "$lines"; return 0; }
  fi

  local url="https://api.themoviedb.org/3/tv/${tv_id}/videos?${base_params}"
  local r; r=$(api "$url" 2>/dev/null || echo '{"results":[]}')
  local lines; lines=$(printf '%s' "$r" | jq -r "$jq_trailer_defs filt" 2>/dev/null || echo '')
  [[ -n "$lines" ]] && { printf '%s\n' "$lines"; return 0; }
  local wide_params="api_key=${TMDB_API_KEY}&language=${PREFERRED_LANG}&include_video_language=${INCLUDE_LANGS_WIDE}"
  if [[ -n "$episode_no" && -n "$season_no" ]]; then
    r=$(api "https://api.themoviedb.org/3/tv/${tv_id}/season/${season_no}/episode/${episode_no}/videos?${wide_params}" 2>/dev/null || echo '{"results":[]}')
    lines=$(printf '%s' "$r" | jq -r "$jq_trailer_defs filt" 2>/dev/null || echo '')
    [[ -n "$lines" ]] && { printf '%s\n' "$lines"; return 0; }
  fi

  if [[ -n "$season_no" ]]; then
    r=$(api "https://api.themoviedb.org/3/tv/${tv_id}/season/${season_no}/videos?${wide_params}" 2>/dev/null || echo '{"results":[]}')
    lines=$(printf '%s' "$r" | jq -r "$jq_trailer_defs filt" 2>/dev/null || echo '')
    [[ -n "$lines" ]] && { printf '%s\n' "$lines"; return 0; }
  fi

  r=$(api "https://api.themoviedb.org/3/tv/${tv_id}/videos?${wide_params}" 2>/dev/null || echo '{"results":[]}')
  printf '%s' "$r" | jq -r "$jq_trailer_defs filt" || true
}

declare -A SEEN_DIRS
declare -A DIR_TESTED
declare -A DIR_WRITABLE

check_dir_writable() {
  local dir="$1"
  [[ -z "$dir" ]] && return 1

  if [[ "${DIR_TESTED[$dir]:-0}" -eq 1 ]]; then
    [[ "${DIR_WRITABLE[$dir]:-0}" -eq 1 ]]
    return
  fi
  DIR_TESTED[$dir]=1

  local probe="$dir/.jmsf_probe_$$"
  if touch "$probe" 2>/dev/null; then
    rm -f "$probe" 2>/dev/null || true
    DIR_WRITABLE[$dir]=1
    echo "[INFO] Yazılabilir klasör: $dir" >&2
    return 0
  else
    DIR_WRITABLE[$dir]=0
    echo "[WARN] Yazılamayan klasör, atlanacak: $dir" >&2
    return 1
  fi
}

process_item() {
  local id="$1" type="$2" name="$3" year="$4" path="$5" tmdb="$6" imdb="$7" user_id="$8"
  local dir out; dir="$(dirname "$path")"; out="${dir}/trailer.mp4"
  echo "[DEBUG] OVERWRITE_POLICY=$OVERWRITE_POLICY DIR=$dir OUT=$out EXISTS=$([[ -e "$out" ]] && echo 1 || echo 0)" >&2
  SEEN_DIRS["$dir"]=1

  if ! check_dir_writable "$dir"; then
    echo "[ATLA] Yazılamayan klasör, atlanıyor: $dir  ->  $name ($year)"
    DL_SKIP+=1
    return 0
  fi

  local compare_after=0
  if [[ -e "$out" ]]; then
    case "$OVERWRITE_POLICY" in
      skip)
        if [[ "${ENABLE_THEME_LINK:-0}" -eq 1 ]]; then
          ensure_backdrops_theme "$dir" "$out" || true
          echo "[ATLA] Zaten var: $out  -> theme.mp4 kuruldu/korundu."
        else
          echo "[ATLA] Zaten var: $out  ->  $name ($year)"
        fi
        DL_SKIP+=1
        return 0
        ;;
      replace)
        echo "[BİLGİ] Üzerine yazılacak: $out"
        ;;
      if-better)
        echo "[BİLGİ] if-better modu: karşılaştırma için indirilecek."
        compare_after=1
        ;;
    esac
  fi

  echo "[DEBUG] İşleniyor: $name (IMDb: ${imdb:-}, TMDb: ${tmdb:-}, Tür: $type)" >&2
  local tmdb_id="${tmdb:-}" season_no="" episode_no=""
  if [[ "$type" == "Movie" ]]; then
    if [[ -z "$tmdb_id" && -n "${imdb:-}" ]]; then
      local map; map=$(imdb_to_tmdb "$imdb" "Movie" || true)
      [[ -n "${map:-}" ]] && tmdb_id="${map##*:}"
    fi
  elif [[ "$type" == "Series" || "$type" == "Season" || "$type" == "Episode" ]]; then
    local item; item=$(curl -sS -H "X-Emby-Token: $JF_API_KEY" \
      "$JF_BASE/Users/$user_id/Items/$id?Fields=SeriesId,SeasonId,IndexNumber,ParentIndexNumber,ProviderIds,Type" || true)
    local series_id; series_id=$(echo "$item" | jq -r '.SeriesId // empty')
    local idx;        idx=$(echo "$item" | jq -r '.IndexNumber // empty')
    local parent_idx; parent_idx=$(echo "$item" | jq -r '.ParentIndexNumber // empty')

    local series_tmdb=""
    if [[ -n "$series_id" ]]; then
      local s; s=$(curl -sS -H "X-Emby-Token: $JF_API_KEY" "$JF_BASE/Users/$user_id/Items/$series_id?Fields=ProviderIds" || true)
      series_tmdb=$(echo "$s" | jq -r '.ProviderIds.Tmdb // .ProviderIds.MovieDb // empty')
    fi
    if [[ -z "$series_tmdb" && -n "$tmdb_id" && "$type" == "Series" ]]; then
      series_tmdb="$tmdb_id"
    fi

    tmdb_id="$series_tmdb"
    [[ "$type" == "Episode" ]] && { episode_no="$idx"; season_no="$parent_idx"; }
    [[ "$type" == "Season"  ]] && season_no="$idx"
  fi

  local key_stream success=0
  if [[ "$type" == "Movie" ]]; then
    [[ -z "${tmdb_id:-}" ]] && { echo "[ATLA] TMDb ID yok: $name"; DL_FAIL+=1; return 0; }
    key_stream="$(find_trailer_keys_movie "$tmdb_id" || true)"
  elif [[ "$type" == "Series" || "$type" == "Season" || "$type" == "Episode" ]]; then
    [[ -z "${tmdb_id:-}" ]] && { echo "[ATLA] Series TMDb yok: $name"; DL_FAIL+=1; return 0; }
    key_stream="$(find_trailer_keys_tv "$tmdb_id" "${season_no:-}" "${episode_no:-}" || true)"
  else
    echo "[ATLA] Tür desteklenmiyor: $type - $name"
    DL_FAIL+=1
    return 0
  fi

  local tried=0
  while IFS= read -r raw; do
    [[ -n "${raw// }" ]] || continue
    raw=$(printf '%s' "$raw" | tr -d '\r')

    local site="${raw%%|*}" key="${raw#*|}"
    local url=""
    if [[ "$site" == "youtube" ]]; then
      key="$(printf '%s' "$key" | tr -d '\r' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
      url="https://www.youtube.com/watch?v=${key}"
    elif [[ "$site" == "vimeo" ]]; then
      [[ -n "$key" ]] || continue
      url="https://vimeo.com/${key}"
    else
      continue
    fi

    tried=$((tried+1))
    echo "[DEBUG] Denenen #$tried: ${site}:${key}" >&2

    local free_mb_dest; free_mb_dest=$(get_free_mb "$dir"); [[ -z "$free_mb_dest" ]] && free_mb_dest=0
    local free_mb_work; free_mb_work=$(get_free_mb "$WORK_DIR"); [[ -z "$free_mb_work" ]] && free_mb_work=0
    if (( free_mb_dest < MIN_FREE_MB )); then
      echo "[WARN] Hedefte yetersiz boş alan: ${free_mb_dest} MiB (< ${MIN_FREE_MB} MiB). Atlanıyor: $name ($year)" >&2
      continue
    fi
    if (( free_mb_work < MIN_FREE_MB )); then
      echo "[WARN] Çalışma klasöründe yetersiz boş alan: ${free_mb_work} MiB (< ${MIN_FREE_MB} MiB). Atlanıyor: $name ($year)" >&2
      continue
    fi

    local tmp="$WORK_DIR/${id}.tmp.mp4"
    cleanup_tmp() { rm -f "$tmp" >/dev/null 2>&1 || true; }
    trap 'cleanup_tmp' EXIT INT TERM

    echo "[INDIR] $name ($year) -> $out  [${site}:${key}] (best mp4)"
    local yd_base=(
      --force-ipv4
      -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]"
      --no-part
      --no-progress
      -o "$tmp" "$url"
    )

    if [[ -n "$COOKIES_BROWSER" ]]; then
      yd_base=( --cookies-from-browser "$COOKIES_BROWSER" "${yd_base[@]}" )
    fi

    if ! yt-dlp "${yd_base[@]}"; then
      echo "[WARN] yt-dlp indirme başarısız (${site}:${key})." >&2
      cleanup_tmp
      if df -Pm "$dir" | awk 'NR==2{exit !($4<1)}'; then
        echo "[ERROR] Diskte yer kalmamış. Film atlanıyor: $name ($year)" >&2
      fi
      trap - EXIT INT TERM
      continue
    fi

    local size_bytes; size_bytes=$(stat -c%s "$tmp" 2>/dev/null || echo 0)
    if [[ "${size_bytes:-0}" -lt $((2*1024*1024)) ]]; then
      echo "[WARN] Dosya çok küçük (${size_bytes}B). Siliniyor ve sonraki aday denenecek..." >&2
      cleanup_tmp; continue
    fi
    if command -v ffprobe >/dev/null; then
      local dur; dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$tmp" 2>/dev/null || echo 0)
      awk "BEGIN { exit !($dur < 20 && $dur > 0) }" && short=1 || short=0
      if (( short == 1 )); then
        echo "[WARN] Süre kısa (${dur}s). Siliniyor ve sonraki aday denenecek..." >&2
        cleanup_tmp; continue
      fi
    fi

    local tmp_size tmp_dur out_size out_dur
    tmp_size=$(stat -c%s "$tmp" 2>/dev/null || echo 0)
    if command -v ffprobe >/dev/null; then
      tmp_dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$tmp" 2>/dev/null || echo 0)
    else
      tmp_dur=0
    fi

    if (( compare_after == 1 )) && [[ -e "$out" ]]; then
      out_size=$(stat -c%s "$out" 2>/dev/null || echo 0)
      if command -v ffprobe >/dev/null; then
        out_dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out" 2>/dev/null || echo 0)
      else
        out_dur=0
      fi

      awk -v nd="$tmp_dur" -v od="$out_dur" -v ds="$tmp_size" -v os="$out_size" \
          -v dth="$BETTER_MIN_DURATION_DELTA" -v sth="$BETTER_MIN_SIZE_DELTA" '
          BEGIN {
            better = 0
            if (nd > 0 && od > 0 && (nd - od) >= dth) better = 1
            if (!better && (ds - os) >= sth) better = 1
            exit(better ? 0 : 1)
          }'
      if [[ $? -eq 0 ]]; then
        echo "[OK] Yeni trailer daha iyi bulundu (if-better): değiştiriliyor."
        if ! mv -f "$tmp" "$out" 2>/dev/null; then
          echo "[HATA] mv başarısız, yazılamıyor: $out" >&2
          rm -f "$tmp"
          DL_FAIL+=1
          trap - EXIT INT TERM
          return 0
        fi
        ensure_backdrops_theme "$dir" "$out" || true
      else
        echo "[ATLA] Mevcut trailer daha iyi/eşdeğer: yenisi silindi."
        rm -f "$tmp"
        trap - EXIT INT TERM
        if [[ "${ENABLE_THEME_LINK:-0}" -eq 1 ]]; then
          ensure_backdrops_theme "$dir" "$out" || true
        fi
        DL_SKIP+=1
        return 0
      fi
    else
      if ! mv -f "$tmp" "$out" 2>/dev/null; then
        echo "[HATA] mv başarısız, yazılamıyor: $out" >&2
        rm -f "$tmp"
        DL_FAIL+=1
        trap - EXIT INT TERM
        return 0
      fi
      if [[ "${ENABLE_THEME_LINK:-0}" -eq 1 ]]; then
        ensure_backdrops_theme "$dir" "$out" || true
      fi
    fi

    trap - EXIT INT TERM
    curl -sS -X POST -H "X-Emby-Token: $JF_API_KEY" \
      "$JF_BASE/Items/$id/Refresh?Recursive=true&ImageRefreshMode=Default&MetadataRefreshMode=Default&RegenerateTrickplay=false&ReplaceAllMetadata=false" >/dev/null || true

    echo "[OK] Eklendi ve yenilendi: $out"
    DL_OK+=1
    sleep "$SLEEP_SECS"
    success=1
    return 0

  done <<< "$key_stream"

  if (( success == 0 )); then
    echo "[ATLA] Uygun indirilebilir trailer bulunamadı: $name ($year)"
    DL_FAIL+=1
  fi
  return 0
}

user_id="$(resolve_user_id || true)"
start=0; processed=0

while :; do
  if [[ -n "$user_id" ]]; then
    url="${JF_BASE}/Users/${user_id}/Items?IncludeItemTypes=${INCLUDE_TYPES}&Recursive=true&Fields=Path,ProviderIds,ProductionYear,MediaSources&StartIndex=${start}&Limit=${PAGE_SIZE}"
  else
    url="${JF_BASE}/Items?IncludeItemTypes=${INCLUDE_TYPES}&Recursive=true&Fields=Path,ProviderIds,ProductionYear,MediaSources&StartIndex=${start}&Limit=${PAGE_SIZE}"
  fi

  page=$(api -H "X-Emby-Token: $JF_API_KEY" "$url")
  total=$(echo "$page" | jq -r '.TotalRecordCount // 0')
  echo "JMSF::TOTAL=${total}"

  items=$(echo "$page" | jq -c '.Items[]?' 2>/dev/null || echo '')

  while IFS= read -r it; do
    [[ -z "$it" ]] && continue

    id=$(echo "$it"   | jq -r '.Id')
    type=$(echo "$it" | jq -r '.Type')
    name=$(echo "$it" | jq -r '.Name')
    year=$(echo "$it" | jq -r '.ProductionYear // empty')
    path=$(echo "$it" | jq -r '.Path // .MediaSources[0].Path // empty')

    tmdb=$(echo "$it" | jq -r '.ProviderIds.Tmdb // .ProviderIds.MovieDb // empty')
    imdb=$(echo "$it" | jq -r '.ProviderIds.Imdb // empty')

    if [[ -z "$path" ]]; then
  continue
fi

    process_item "$id" "$type" "$name" "$year" "$path" "$tmdb" "$imdb" "$user_id" || true
    processed=$((processed+1))
    echo "JMSF::DONE=${processed}"
  done <<< "$items"

  start=$((start + PAGE_SIZE))
  [[ $start -lt $total ]] || break
done


echo "[INFO] Geçici dosyalar temizleniyor..."
for d in "${!SEEN_DIRS[@]}"; do
  find "$d" -maxdepth 1 -type f \
    \( -name '*.part' -o -name '*.tmp' -o -name '*.tmp.mp4' -o -name '*.ytdl' \) \
    -print -delete 2>/dev/null || true
done

IFS=':' read -r -a EXTRA <<< "$CLEANUP_EXTRA_PATHS"
for root in "${EXTRA[@]}"; do
  [[ -d "$root" ]] || continue
  find "$root" -type f \
    \( -name '*.part' -o -name '*.tmp' -o -name '*.tmp.mp4' -o -name '*.ytdl' \) \
    -print -delete 2>/dev/null || true
done

find "$WORK_DIR" -type f \
  \( -name '*.part' -o -name '*.tmp' -o -name '*.tmp.mp4' -o -name '*.ytdl' \) \
  -print -delete 2>/dev/null || true

echo
echo "BİTTİ: işlenen=$processed"
echo "ÖZET -> indirilen=${DL_OK}, başarısız=${DL_FAIL}, atlanan(zaten vardı)=${DL_SKIP}"
