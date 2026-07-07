// YouTube Music InnerTube API client - ported from Musiq's Kotlin implementation
// Base: https://music.youtube.com/youtubei/v1/

const BASE_URL = "https://music.youtube.com/youtubei/v1";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const ORIGIN = "https://music.youtube.com";
const REFERER = "https://music.youtube.com/";

// Multiple YouTube clients to try as fallbacks
// Some clients return direct URLs, others use signatureCipher
const YT_CLIENTS = [
  {
    clientName: "IOS",
    clientVersion: "19.29.1",
    clientId: "5",
    userAgent: "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)",
  },
  {
    clientName: "ANDROID_VR",
    clientVersion: "1.61.48",
    clientId: "28",
    userAgent: "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; Cronet/132.0.6808.3)",
  },
  {
    clientName: "WEB_REMIX",
    clientVersion: "1.20260114.01.00",
    clientId: "67",
    userAgent: USER_AGENT,
  },
  {
    clientName: "ANDROID_MUSIC",
    clientVersion: "7.27.52",
    clientId: "21",
    userAgent: "com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 15; en_US; Pixel 9 Pro; Build/AP4A.250205.002; Cronet/132.0.6834.79) gzip",
  },
  {
    clientName: "IOS_MUSIC",
    clientVersion: "7.27.0",
    clientId: "26",
    userAgent: "com.google.ios.youtubemusic/7.27.0 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)",
  },
];

interface Context {
  client: {
    clientName: string;
    clientVersion: string;
    gl: string;
    hl: string;
    visitorData?: string;
  };
  user?: { onBehalfOfUser?: string };
}

function buildContext(visitorData?: string, ytClient?: typeof YT_CLIENTS[0]): Context {
  const c = ytClient || YT_CLIENTS[2]; // default WEB_REMIX
  return {
    client: {
      clientName: c.clientName,
      clientVersion: c.clientVersion,
      gl: "US",
      hl: "en",
      ...(visitorData ? { visitorData } : {}),
    },
  };
}

function buildHeaders(visitorData?: string, ytClient?: typeof YT_CLIENTS[0]): HeadersInit {
  const c = ytClient || YT_CLIENTS[2];
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Goog-Api-Format-Version": "1",
    "X-YouTube-Client-Name": c.clientId,
    "X-YouTube-Client-Version": c.clientVersion,
    "X-Origin": ORIGIN,
    Referer: REFERER,
    "User-Agent": c.userAgent,
  };
  if (visitorData) h["X-Goog-Visitor-Id"] = visitorData;
  return h;
}

let cachedVisitorData: string | null = null;

async function getVisitorData(): Promise<string> {
  if (cachedVisitorData) return cachedVisitorData;
  try {
    const res = await fetch(`${BASE_URL}/browse?prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-Goog-Api-Format-Version": "1",
        "X-YouTube-Client-Name": "67",
        "X-YouTube-Client-Version": "1.20260114.01.00",
        "X-Origin": ORIGIN,
        Referer: REFERER,
      },
      body: JSON.stringify({
        context: buildContext(),
        browseId: "FEmusic_home",
      }),
    });
    const data = await res.json();
    cachedVisitorData =
      data?.responseContext?.visitorData ?? null;
    return cachedVisitorData ?? "";
  } catch {
    return "";
  }
}

// --- Search ---
export interface SongResult {
  videoId: string;
  title: string;
  artists: string;
  thumbnail: string;
  duration: string;
  album?: string;
}

function extractSongs(contents: any[]): SongResult[] {
  const songs: SongResult[] = [];
  for (const item of contents) {
    const renderer =
      item?.musicResponsiveListItemRenderer ||
      item?.musicCardShelfRenderer?.content?.musicResponsiveListItemRenderer;
    if (!renderer) continue;

    const flex1 = renderer.flexColumns?.[1];
    const title =
      flex1?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text ??
      renderer.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text ??
      "";
    const artistRuns =
      flex1?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.slice(1) ?? [];
    const artists = artistRuns
      .filter((r: any) => r.navigationEndpoint)
      .map((r: any) => r.text)
      .join(", ");
    const videoId =
      renderer.playlistItemData?.videoId ??
      renderer.navigationEndpoint?.watchEndpoint?.videoId ??
      "";
    const thumbnail =
      renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url ??
      item?.musicCardShelfRenderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url ??
      "";
    const duration =
      renderer.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text ??
      "";

    if (videoId && title) {
      songs.push({ videoId, title, artists, thumbnail, duration });
    }
  }
  return songs;
}

export async function search(query: string): Promise<SongResult[]> {
  const visitorData = await getVisitorData();
  const res = await fetch(`${BASE_URL}/search?prettyPrint=false`, {
    method: "POST",
    headers: buildHeaders(visitorData || undefined),
    body: JSON.stringify({
      context: buildContext(visitorData || undefined),
      query,
    }),
  });
  const data = await res.json();
  const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs;
  const content =
    tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];
  const allItems = content.flatMap((s: any) => [
    ...(s.musicShelfRenderer?.contents ?? []),
    ...(s.itemSectionRenderer?.contents ?? []),
  ]);
  return extractSongs(allItems);
}

// --- Player (get stream URL with multi-client fallback) ---
export interface StreamInfo {
  url: string;
  mimeType: string;
  bitrate: number;
  quality: string;
  contentLength?: number;
}

// Parse signatureCipher to extract the URL and signature
function parseCipher(cipher: string): { url: string; sig?: string; sp?: string } {
  const params = new URLSearchParams(cipher);
  return {
    url: params.get("url") || "",
    sig: params.get("s") || undefined,
    sp: params.get("sp") || undefined,
  };
}

export async function getPlayer(
  videoId: string
): Promise<{
  url: string;
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  streams: StreamInfo[];
}> {
  const visitorData = await getVisitorData();
  let lastError: Error | null = null;

  // Try each YouTube client until we get a playable stream URL
  for (const ytClient of YT_CLIENTS) {
    try {
      const ctx = buildContext(visitorData || undefined, ytClient);
      const hdrs = buildHeaders(visitorData || undefined, ytClient);

      const res = await fetch(`${BASE_URL}/player?prettyPrint=false`, {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({
          context: ctx,
          videoId,
        }),
      });

      const data = await res.json();

      if (data.playabilityStatus?.status !== "OK") {
        lastError = new Error(data.playabilityStatus?.reason || "Not playable");
        continue; // try next client
      }

      const streamingData = data.streamingData;
      if (!streamingData) {
        lastError = new Error("No streaming data");
        continue;
      }

      const formats = [
        ...(streamingData.adaptiveFormats ?? []),
        ...(streamingData.formats ?? []),
      ];

      // Collect all audio formats, prefer ones with direct URLs
      const audioFormats: {
        url: string;
        mimeType: string;
        bitrate: number;
        quality: string;
        contentLength?: number;
        isDirect: boolean;
      }[] = [];

      for (const f of formats) {
        if (f.width) continue; // skip video formats

        let url = f.url || "";
        let isDirect = !!url;

        // If no direct URL, try to parse signatureCipher
        if (!url && (f.signatureCipher || f.cipher)) {
          const parsed = parseCipher(f.signatureCipher || f.cipher);
          if (parsed.url) {
            // For clients that return signatureCipher, we just use the URL
            // The signature is sometimes not needed for audio-only formats
            url = parsed.url;
            isDirect = false;
          }
        }

        if (url) {
          audioFormats.push({
            url,
            mimeType: f.mimeType || "audio/mp4",
            bitrate: f.bitrate || 128000,
            quality: f.quality || "medium",
            contentLength: f.contentLength,
            isDirect,
          });
        }
      }

      // Sort: prefer direct URLs, then by bitrate
      audioFormats.sort((a, b) => {
        if (a.isDirect !== b.isDirect) return a.isDirect ? -1 : 1;
        return b.bitrate - a.bitrate;
      });

      if (audioFormats.length === 0) {
        lastError = new Error("No audio formats found");
        continue;
      }

      const best = audioFormats[0];
      const vd = data.videoDetails;

      return {
        url: best.url,
        title: vd?.title ?? "",
        author: vd?.author ?? "",
        duration: parseInt(vd?.lengthSeconds ?? "0", 10),
        thumbnail: vd?.thumbnail?.thumbnails?.slice(-1)[0]?.url ?? "",
        streams: audioFormats.map((f) => ({
          url: f.url,
          mimeType: f.mimeType,
          bitrate: f.bitrate,
          quality: f.quality,
          contentLength: f.contentLength,
        })),
      };
    } catch (e: any) {
      console.error(`Client ${ytClient.clientName} failed:`, e.message);
      lastError = e;
    }
  }

  throw lastError || new Error("All clients failed to get stream");
}

// --- Browse (Home) ---
export interface HomeSection {
  title: string;
  songs: SongResult[];
}

export async function home(): Promise<HomeSection[]> {
  const visitorData = await getVisitorData();
  const res = await fetch(`${BASE_URL}/browse?prettyPrint=false`, {
    method: "POST",
    headers: buildHeaders(visitorData || undefined),
    body: JSON.stringify({
      context: buildContext(visitorData || undefined),
      browseId: "FEmusic_home",
    }),
  });
  const data = await res.json();
  const sections =
    data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer
      ?.content?.sectionListRenderer?.contents ?? [];

  return sections
    .map((s: any) => {
      const shelf = s.musicCarouselShelfRenderer ?? s.musicShelfRenderer;
      const title =
        shelf?.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]
          ?.text ??
        shelf?.title?.runs?.[0]?.text ??
        "";
      const contents = shelf?.contents ?? [];
      return { title, songs: extractSongs(contents) };
    })
    .filter((s: HomeSection) => s.songs.length > 0);
}

// --- Lyrics (LrcLib) ---
export interface LyricLine {
  time: number; // ms
  text: string;
}

export async function getLyrics(
  title: string,
  artist: string,
  duration?: number
): Promise<LyricLine[]> {
  try {
    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist,
    });
    const res = await fetch(
      `https://lrclib.net/api/search?${params.toString()}`,
      { headers: { "User-Agent": USER_AGENT } }
    );
    const tracks: any[] = await res.json();
    const synced = tracks.filter(
      (t) =>
        t.syncedLyrics &&
        (!duration || Math.abs(t.duration - duration) <= 3)
    );
    if (synced.length === 0) return [];

    const lrcText = synced[0].syncedLyrics;
    const lines: LyricLine[] = [];
    for (const line of lrcText.split("\n")) {
      const match = line.match(
        /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/
      );
      if (match) {
        const ms =
          parseInt(match[1]) * 60000 +
          parseInt(match[2]) * 1000 +
          parseInt(match[3].padEnd(3, "0"));
        const text = match[4].trim();
        if (text) lines.push({ time: ms, text });
      }
    }
    return lines;
  } catch {
    return [];
  }
}