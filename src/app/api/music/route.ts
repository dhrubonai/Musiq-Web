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

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e: any) {
    console.error("Music API error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}