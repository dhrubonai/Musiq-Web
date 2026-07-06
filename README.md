# 🎵 Musiq Web

A modern, ad-free web music player powered by YouTube Music's InnerTube API. This is the web version of the [Musiq](https://github.com/dhrubonai/musiq) Android app.

![Musiq Web](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8?logo=tailwindcss)

## ✨ Features

- **Ad-free Music Streaming** — Stream music directly from YouTube Music's InnerTube API
- **Home Feed** — Browse curated sections and trending music
- **Search** — Find songs, artists, and albums instantly
- **Audio Player** — Full-featured player with play/pause, skip, seek, and volume control
- **Queue Management** — View and manage your playback queue
- **Shuffle & Repeat** — Shuffle your queue or repeat tracks (all/one)
- **Synced Lyrics** — Real-time synced lyrics powered by LrcLib
- **Like Songs** — Save your favorite tracks (persisted in localStorage)
- **Keyboard Shortcuts** — Space (play/pause), Arrow keys (seek), / (search)
- **Dark Theme** — Sleek black & white design optimized for music
- **Responsive** — Works on desktop, tablet, and mobile
- **No Account Required** — Start listening immediately

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| [Next.js 16](https://nextjs.org/) | React framework with App Router |
| [TypeScript](https://www.typescriptlang.org/) | Type-safe development |
| [Tailwind CSS 4](https://tailwindcss.com/) | Utility-first styling |
| [YouTube InnerTube API](https://music.youtube.com/youtubei/v1/) | Music search, streaming, and metadata |
| [LrcLib](https://lrclib.net/) | Synced lyrics API |
| [HTML5 Audio](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAudioElement) | Audio playback |

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 18+ or [Bun](https://bun.sh/)
- npm, yarn, or bun

### Installation

```bash
# Clone the repository
git clone https://github.com/dhrubonai/musiq-web.git
cd musiq-web

# Install dependencies
bun install
# or: npm install

# Start development server
bun dev
# or: npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `←` | Seek back 5 seconds |
| `→` | Seek forward 5 seconds |
| `/` | Focus search bar |

## 🏗️ Architecture

### How It Works

Musiq Web uses **YouTube Music's InnerTube API** — the same internal API that the YouTube Music web app uses. Here's the flow:

1. **Search/Browse** — The frontend calls our Next.js API route (`/api/music`), which proxies requests to YouTube's InnerTube API endpoints
2. **Stream Resolution** — When a song is selected, the server calls the `player` endpoint to get streaming URLs (adaptive audio formats)
3. **Playback** — The audio URL is passed to an HTML5 `<audio>` element for playback
4. **Lyrics** — Synced lyrics are fetched from LrcLib based on song title and artist

### API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/music?type=home` | GET | Fetch home feed sections |
| `/api/music?type=search&q=query` | GET | Search for songs |
| `/api/music?type=player&videoId=id` | GET | Get stream URL for a song |
| `/api/music?type=lyrics&title=t&artist=a` | GET | Fetch synced lyrics |

### Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── music/
│   │       └── route.ts    # API proxy for InnerTube + LrcLib
│   ├── globals.css          # Global styles + custom scrollbars + animations
│   ├── layout.tsx           # Root layout with metadata
│   └── page.tsx             # Main music player UI (single-page app)
├── lib/
│   └── innertube.ts         # YouTube InnerTube API client
└── components/ui/           # shadcn/ui components
```

## 📱 Comparison with Musiq (Android)

| Feature | Musiq (Android) | Musiq Web |
|---|---|---|
| Music Source | YouTube InnerTube | YouTube InnerTube ✅ |
| Audio Player | ExoPlayer (Media3) | HTML5 Audio ✅ |
| Search | YouTube Search | YouTube Search ✅ |
| Home Feed | YouTube Browse | YouTube Browse ✅ |
| Lyrics | LrcLib / YouTube | LrcLib ✅ |
| Playlists | Local DB + YouTube | Queue only |
| Downloads | Offline cache | Not available |
| Equalizer | System EQ | Not available |
| Crossfade | Built-in | Not available |
| Account Login | YouTube OAuth | Not required |

## 📄 License

This project is for educational and personal use only. Music is streamed from YouTube and is subject to YouTube's Terms of Service.

---

Built with ❤️ by [dhrubonai](https://github.com/dhrubonai)