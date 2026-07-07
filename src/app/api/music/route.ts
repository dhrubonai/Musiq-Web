import { NextRequest, NextResponse } from "next/server";
import { search, getPlayer, home, getLyrics } from "@/lib/innertube";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  try {
    if (type === "search") {
      const q = searchParams.get("q");
      if (!q) return NextResponse.json({ error: "Missing query" }, { status: 400 });
      const results = await search(q);
      return NextResponse.json(results);
    }

    if (type === "player") {
      const videoId = searchParams.get("videoId");
      if (!videoId) return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
      const info = await getPlayer(videoId);
      return NextResponse.json(info);
    }

    if (type === "home") {
      const sections = await home();
      return NextResponse.json(sections);
    }

    if (type === "lyrics") {
      const title = searchParams.get("title");
      const artist = searchParams.get("artist");
      const duration = searchParams.get("duration");
      if (!title || !artist) return NextResponse.json({ error: "Missing params" }, { status: 400 });
      const lyrics = await getLyrics(title, artist, duration ? parseInt(duration) : undefined);
      return NextResponse.json(lyrics);
    }

    // Stream proxy - fetch audio from YouTube and pipe to browser
    if (type === "stream") {
      const videoId = searchParams.get("videoId");
      if (!videoId) return NextResponse.json({ error: "Missing videoId" }, { status: 400 });

      const info = await getPlayer(videoId);
      if (!info.url) return NextResponse.json({ error: "No stream URL" }, { status: 404 });

      const audioRes = await fetch(info.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Range: req.headers.get("range") || "",
        },
      });

      if (!audioRes.ok && audioRes.status !== 206) {
        return NextResponse.json({ error: "Stream fetch failed" }, { status: 502 });
      }

      const contentType = audioRes.headers.get("content-type") || "audio/mp4";
      const contentLength = audioRes.headers.get("content-length");
      const contentRange = audioRes.headers.get("content-range");
      const acceptRanges = audioRes.headers.get("accept-ranges");

      const headers = new Headers();
      headers.set("Content-Type", contentType);
      if (contentLength) headers.set("Content-Length", contentLength);
      if (contentRange) headers.set("Content-Range", contentRange);
      if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);
      headers.set("Cache-Control", "public, max-age=3600");

      return new NextResponse(audioRes.body, {
        status: audioRes.status,
        headers,
      });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e: any) {
    console.error("Music API error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}