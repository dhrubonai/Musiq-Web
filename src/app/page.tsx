'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Search, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  Music2, Loader2, X, ChevronRight, Home, Clock, Repeat, Repeat1,
  Shuffle, ListMusic, Heart, ChevronLeft
} from 'lucide-react'

interface Song {
  videoId: string
  title: string
  artists: string
  thumbnail: string
  duration: string
  album?: string
}

interface HomeSection {
  title: string
  songs: Song[]
}

interface LyricLine {
  time: number
  text: string
}

type Tab = 'home' | 'search' | 'lyrics'
type RepeatMode = 'off' | 'all' | 'one'

function formatTime(sec: number) {
  if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function MusiqWeb() {
  const [tab, setTab] = useState<Tab>('home')
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Song[]>([])
  const [homeSections, setHomeSections] = useState<HomeSection[]>([])
  const [loading, setLoading] = useState(false)
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [queue, setQueue] = useState<Song[]>([])
  const [originalQueue, setOriginalQueue] = useState<Song[]>([])
  const [queueIndex, setQueueIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [muted, setMuted] = useState(false)
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [streamUrl, setStreamUrl] = useState('')
  const [streamLoading, setStreamLoading] = useState(false)
  const [activeLyricIdx, setActiveLyricIdx] = useState(0)
  const [showQueue, setShowQueue] = useState(false)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off')
  const [shuffled, setShuffled] = useState(false)
  const [likedSongs, setLikedSongs] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const audioRef = useRef<HTMLAudioElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const prevVolumeRef = useRef(0.8)

  // Load home feed
  useEffect(() => {
    async function loadHome() {
      setLoading(true)
      try {
        const res = await fetch('/api/music?type=home')
        const data = await res.json()
        if (Array.isArray(data)) setHomeSections(data)
      } catch (e) {
        console.error('Home load error:', e)
        setError('Failed to load home feed. Please try again.')
      }
      setLoading(false)
    }
    loadHome()
  }, [])

  // Load liked songs from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('musiq-liked')
      if (saved) setLikedSongs(new Set(JSON.parse(saved)))
    } catch { /* ignore */ }
  }, [])

  // Save liked songs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('musiq-liked', JSON.stringify([...likedSongs]))
    } catch { /* ignore */ }
  }, [likedSongs])

  // Audio time update
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setCurrentTime(audio.currentTime)
    const onDuration = () => setDuration(audio.duration || 0)
    const onEnded = () => handleSongEnd()
    const onError = () => {
      console.error('Audio error')
      if (queue.length > 1) {
        setTimeout(() => playNext(), 1000)
      }
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onDuration)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onDuration)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [queueIndex, queue.length, repeatMode, shuffled])

  // Volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume
  }, [volume, muted])

  // Synced lyrics scroll
  useEffect(() => {
    if (lyrics.length === 0) return
    const ms = currentTime * 1000
    let idx = 0
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (lyrics[i].time <= ms) { idx = i; break }
    }
    setActiveLyricIdx(idx)
    const el = document.getElementById(`lyric-${idx}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentTime, lyrics])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowRight':
          if (audioRef.current) audioRef.current.currentTime += 5
          break
        case 'ArrowLeft':
          if (audioRef.current) audioRef.current.currentTime -= 5
          break
        case '/':
          e.preventDefault()
          searchInputRef.current?.focus()
          break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentSong, isPlaying])

  const shuffleArray = useCallback((arr: Song[]): Song[] => {
    const shuffled = [...arr]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }, [])

  const handleSongEnd = useCallback(() => {
    if (repeatMode === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play()
      }
      return
    }
    if (queue.length === 0) return
    if (repeatMode === 'all' || queueIndex < queue.length - 1) {
      playNext()
    } else {
      setIsPlaying(false)
    }
  }, [queue, queueIndex, repeatMode, shuffled])

  const playSong = useCallback(async (song: Song, songQueue?: Song[], index?: number) => {
    setCurrentSong(song)
    setStreamLoading(true)
    setIsPlaying(false)
    setLyrics([])
    setActiveLyricIdx(0)
    setError('')

    if (songQueue) {
      const q = songQueue
      setOriginalQueue(q)
      if (shuffled) {
        const sq = shuffleArray(q)
        // Move the selected song to the front
        const idx = sq.findIndex(s => s.videoId === song.videoId)
        if (idx > 0) {
          [sq[0], sq[idx]] = [sq[idx], sq[0]]
        }
        setQueue(sq)
        setQueueIndex(0)
      } else {
        setQueue(q)
        setQueueIndex(index ?? 0)
      }
    }

    try {
      // Use stream proxy - audio is piped through our server
      // This avoids IP-binding and CORS issues with YouTube stream URLs
      setStreamUrl(`/api/music?type=stream&videoId=${song.videoId}`)
      setTimeout(() => {
        audioRef.current?.play().then(() => {
          setIsPlaying(true)
        }).catch((err) => {
          console.error('Playback failed:', err)
          setError('Playback failed. Try another track.')
        })
      }, 200)
      // Fetch lyrics in background (don't block playback)
      setLyricsLoading(true)
      fetch(
        `/api/music?type=lyrics&title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artists)}`
      )
        .then(res => res.json())
        .then(lData => { if (Array.isArray(lData) && lData.length > 0) setLyrics(lData) })
        .catch(() => {})
        .finally(() => setLyricsLoading(false))
    } catch (e: any) {
      console.error('Play error:', e)
      setError(e.message || 'Failed to play this track')
    }
    setStreamLoading(false)
  }, [shuffled, shuffleArray])

  const playNext = useCallback(() => {
    if (queue.length === 0) return
    const nextIdx = (queueIndex + 1) % queue.length
    setQueueIndex(nextIdx)
    playSong(queue[nextIdx], queue, nextIdx)
  }, [queue, queueIndex, playSong])

  const playPrev = useCallback(() => {
    if (queue.length === 0) return
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0
      return
    }
    const prevIdx = queueIndex <= 0 ? queue.length - 1 : queueIndex - 1
    setQueueIndex(prevIdx)
    playSong(queue[prevIdx], queue, prevIdx)
  }, [queue, queueIndex, playSong])

  const togglePlay = useCallback(() => {
    if (!currentSong) return
    if (audioRef.current) {
      if (isPlaying) { audioRef.current.pause(); setIsPlaying(false) }
      else { audioRef.current.play(); setIsPlaying(true) }
    }
  }, [currentSong, isPlaying])

  const toggleShuffle = useCallback(() => {
    const newShuffled = !shuffled
    setShuffled(newShuffled)
    if (queue.length === 0) return

    if (newShuffled) {
      const sq = shuffleArray(queue)
      if (currentSong) {
        const idx = sq.findIndex(s => s.videoId === currentSong.videoId)
        if (idx > 0) {
          [sq[0], sq[idx]] = [sq[idx], sq[0]]
        }
      }
      setQueue(sq)
      setQueueIndex(0)
    } else {
      if (currentSong) {
        const idx = originalQueue.findIndex(s => s.videoId === currentSong.videoId)
        setQueue(originalQueue)
        setQueueIndex(idx >= 0 ? idx : 0)
      } else {
        setQueue(originalQueue)
        setQueueIndex(0)
      }
    }
  }, [shuffled, queue, originalQueue, currentSong, shuffleArray])

  const cycleRepeat = useCallback(() => {
    setRepeatMode(prev => {
      if (prev === 'off') return 'all'
      if (prev === 'all') return 'one'
      return 'off'
    })
  }, [])

  const toggleLike = useCallback((song: Song) => {
    setLikedSongs(prev => {
      const next = new Set(prev)
      if (next.has(song.videoId)) next.delete(song.videoId)
      else next.add(song.videoId)
      return next
    })
  }, [])

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setTab('search')
    setError('')
    try {
      const res = await fetch(`/api/music?type=search&q=${encodeURIComponent(query)}`)
      const data = await res.json()
      if (Array.isArray(data)) {
        setSearchResults(data)
        setQueue(data)
        setOriginalQueue(data)
        setQueueIndex(-1)
      }
    } catch (e) {
      console.error('Search error:', e)
      setError('Search failed. Please try again.')
    }
    setLoading(false)
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    if (audioRef.current && duration) {
      audioRef.current.currentTime = pct * duration
    }
  }

  const toggleMute = () => {
    if (muted) {
      setMuted(false)
      setVolume(prevVolumeRef.current)
    } else {
      prevVolumeRef.current = volume
      setMuted(true)
    }
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a] text-[#f5f5f0]">
      <audio ref={audioRef} src={streamUrl || undefined} preload="auto" />

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => setTab('home')}
            className="flex items-center gap-2 font-bold text-base sm:text-lg tracking-tight hover:opacity-80 transition-opacity flex-shrink-0"
          >
            <Music2 className="w-5 h-5" />
            <span className="hidden sm:inline">Musiq</span>
          </button>
          <div className="flex-1 max-w-lg mx-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search songs, artists..."
                className="w-full bg-white/5 border border-white/10 rounded-full pl-10 pr-10 py-2 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-white/20 focus:bg-white/8 transition-all"
              />
              {query && (
                <button onClick={() => { setQuery(''); searchInputRef.current?.focus() }} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-neutral-500 hover:text-white transition-colors" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setTab('home')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${tab === 'home' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}
            >
              <Home className="w-4 h-4 sm:hidden" />
              <span className="hidden sm:inline">Home</span>
            </button>
            <button
              onClick={() => setTab('lyrics')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${tab === 'lyrics' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'}`}
            >
              <Music2 className="w-4 h-4 sm:hidden" />
              <span className="hidden sm:inline">Lyrics</span>
            </button>
          </div>
        </div>
      </header>

      {/* Error Toast */}
      {error && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-lg animate-fade-in">
          {error}
          <button onClick={() => setError('')} className="ml-2 hover:opacity-70">
            <X className="w-3.5 h-3.5 inline" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 pb-28 sm:pb-24 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* Home Tab */}
          {tab === 'home' && (
            <div className="space-y-8 animate-fade-in">
              {loading && homeSections.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                </div>
              ) : homeSections.length > 0 ? (
                homeSections.map((section, si) => (
                  <div key={si}>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-base sm:text-lg font-semibold truncate">{section.title}</h2>
                      <ChevronRight className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {section.songs.slice(0, 10).map((song, i) => (
                        <button
                          key={`${song.videoId}-${i}`}
                          onClick={() => playSong(song, section.songs, i)}
                          className="flex-shrink-0 w-32 sm:w-36 group"
                        >
                          <div className="relative aspect-square rounded-xl overflow-hidden bg-white/5 mb-2">
                            {song.thumbnail ? (
                              <img src={song.thumbnail} alt={song.title} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Music2 className="w-8 h-8 text-neutral-600" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                              </div>
                            </div>
                            {currentSong?.videoId === song.videoId && isPlaying && (
                              <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 playing-indicator">
                                <span className="h-3" /><span className="h-4" /><span className="h-2" />
                              </div>
                            )}
                          </div>
                          <p className={`text-sm font-medium truncate text-left ${currentSong?.videoId === song.videoId ? 'text-white' : ''}`}>{song.title}</p>
                          <p className="text-xs text-neutral-500 truncate text-left">{song.artists}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-20 text-neutral-500">
                  <Music2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Unable to load home feed</p>
                  <button onClick={() => window.location.reload()} className="mt-2 text-sm text-white/60 hover:text-white">
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Search Tab */}
          {tab === 'search' && (
            <div className="animate-fade-in">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                </div>
              ) : searchResults.length > 0 ? (
                <div>
                  <h2 className="text-sm font-medium text-neutral-400 mb-3">
                    {searchResults.length} results for &ldquo;{query}&rdquo;
                  </h2>
                  <div className="space-y-0.5">
                    {searchResults.map((song, i) => (
                      <button
                        key={`${song.videoId}-${i}`}
                        onClick={() => playSong(song, searchResults, i)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 transition-colors text-left group"
                      >
                        <span className="w-6 text-center text-sm text-neutral-600 group-hover:hidden flex-shrink-0">{i + 1}</span>
                        <div className="w-6 flex-shrink-0 hidden group-hover:block">
                          {currentSong?.videoId === song.videoId && isPlaying ? (
                            <Pause className="w-4 h-4 text-white mx-auto" />
                          ) : (
                            <Play className="w-4 h-4 text-white mx-auto fill-white" />
                          )}
                        </div>
                        <div className="w-10 h-10 rounded-md overflow-hidden bg-white/5 flex-shrink-0 relative">
                          {song.thumbnail ? (
                            <img src={song.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <Music2 className="w-5 h-5 m-auto text-neutral-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${currentSong?.videoId === song.videoId ? 'text-white' : ''}`}>{song.title}</p>
                          <p className="text-xs text-neutral-500 truncate">{song.artists}{song.album ? ` · ${song.album}` : ''}</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleLike(song) }}
                          className="p-1.5 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
                        >
                          <Heart className={`w-4 h-4 ${likedSongs.has(song.videoId) ? 'fill-red-500 text-red-500' : 'text-neutral-600'}`} />
                        </button>
                        {song.duration && (
                          <span className="text-xs text-neutral-600 flex-shrink-0 w-10 text-right">{song.duration}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 text-neutral-500">
                  <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Search for songs, artists, or albums</p>
                </div>
              )}
            </div>
          )}

          {/* Lyrics Tab */}
          {tab === 'lyrics' && currentSong && (
            <div className="max-w-lg mx-auto animate-fade-in">
              <button
                onClick={() => setTab('home')}
                className="flex items-center gap-1 text-sm text-neutral-400 hover:text-white transition-colors mb-4"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/5 flex-shrink-0 shadow-lg shadow-black/30">
                  {currentSong.thumbnail ? (
                    <img src={currentSong.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music2 className="w-6 h-6 m-auto text-neutral-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{currentSong.title}</p>
                  <p className="text-sm text-neutral-500 truncate">{currentSong.artists}</p>
                </div>
              </div>
              {lyricsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
                </div>
              ) : lyrics.length > 0 ? (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar px-4 py-8">
                  {lyrics.map((line, i) => (
                    <p
                      key={i}
                      id={`lyric-${i}`}
                      className={`text-lg transition-all duration-300 cursor-pointer hover:text-white/80 leading-relaxed ${
                        i === activeLyricIdx
                          ? 'text-white font-bold text-xl sm:text-2xl'
                          : 'text-neutral-500'
                      }`}
                      onClick={() => {
                        if (audioRef.current) audioRef.current.currentTime = line.time / 1000
                      }}
                    >
                      {line.text}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-center text-neutral-500 py-10">No synced lyrics available for this track</p>
              )}
            </div>
          )}

          {/* Lyrics Tab - no song */}
          {tab === 'lyrics' && !currentSong && (
            <div className="text-center py-20 text-neutral-500 animate-fade-in">
              <Music2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Play a song to see lyrics</p>
            </div>
          )}
        </div>
      </main>

      {/* Queue Sheet */}
      {showQueue && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowQueue(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-80 max-w-[85vw] bg-[#141414] border-l border-white/5 h-full overflow-y-auto custom-scrollbar p-4 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <ListMusic className="w-4 h-4" />
                Queue
              </h3>
              <button onClick={() => setShowQueue(false)} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                <X className="w-5 h-5 text-neutral-400" />
              </button>
            </div>
            {queue.length === 0 ? (
              <p className="text-neutral-500 text-sm text-center py-10">Queue is empty</p>
            ) : (
              <div className="space-y-0.5">
                {/* Now Playing */}
                {currentSong && queueIndex >= 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider mb-2 px-2">Now Playing</p>
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
                      <div className="playing-indicator flex-shrink-0">
                        <span className="h-3" /><span className="h-4" /><span className="h-2" />
                      </div>
                      <div className="w-9 h-9 rounded bg-white/10 overflow-hidden flex-shrink-0">
                        {currentSong.thumbnail && <img src={currentSong.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-white">{currentSong.title}</p>
                        <p className="text-xs text-neutral-500 truncate">{currentSong.artists}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Up Next */}
                <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider mb-2 px-2">
                  Up Next · {queue.length - (queueIndex + 1)} songs
                </p>
                {queue.map((song, i) => {
                  if (i === queueIndex) return null
                  return (
                    <button
                      key={`${song.videoId}-${i}`}
                      onClick={() => { playSong(song, queue, i) }}
                      className="w-full flex items-center gap-3 p-2 rounded-lg text-left text-sm transition-colors hover:bg-white/5"
                    >
                      <span className="w-5 text-center text-neutral-600 flex-shrink-0">{i > queueIndex ? i - queueIndex : ''}</span>
                      <div className="w-9 h-9 rounded bg-white/5 overflow-hidden flex-shrink-0">
                        {song.thumbnail && <img src={song.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{song.title}</p>
                        <p className="text-xs text-neutral-500 truncate">{song.artists}</p>
                      </div>
                      {song.duration && <span className="text-xs text-neutral-600 flex-shrink-0">{song.duration}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Player Bar */}
      {currentSong && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#111111]/95 backdrop-blur-xl border-t border-white/5">
          {/* Progress bar (thin, at top of player) */}
          <div className="h-1 bg-white/5 cursor-pointer group" onClick={seek}>
            <div className="h-full bg-white group-hover:bg-white/90 transition-[width] duration-150" style={{ width: `${progress}%` }} />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2 sm:gap-4">
            {/* Song Info */}
            <div className="flex items-center gap-2 sm:gap-3 w-40 sm:w-64 min-w-0 flex-shrink-0">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg overflow-hidden bg-white/5 flex-shrink-0 relative">
                {currentSong.thumbnail ? (
                  <img src={currentSong.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music2 className="w-5 h-5 m-auto text-neutral-600" />
                )}
                {streamLoading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                )}
              </div>
              <div className="min-w-0 hidden sm:block">
                <p className="text-sm font-medium truncate">{currentSong.title}</p>
                <p className="text-xs text-neutral-500 truncate">{currentSong.artists}</p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex-1 flex flex-col items-center gap-1">
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={toggleShuffle}
                  className={`p-1.5 rounded-full transition-colors ${shuffled ? 'text-white bg-white/10' : 'text-neutral-400 hover:text-white hover:bg-white/10'}`}
                  title="Shuffle"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>
                <button onClick={playPrev} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white">
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>
                <button
                  onClick={togglePlay}
                  className="bg-white text-black rounded-full p-2 hover:scale-105 active:scale-95 transition-transform"
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>
                <button onClick={playNext} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white">
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>
                <button
                  onClick={cycleRepeat}
                  className={`p-1.5 rounded-full transition-colors ${repeatMode !== 'off' ? 'text-white bg-white/10' : 'text-neutral-400 hover:text-white hover:bg-white/10'}`}
                  title={`Repeat: ${repeatMode}`}
                >
                  <RepeatIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-neutral-500 w-full max-w-md">
                <span className="w-10 text-right tabular-nums">{formatTime(currentTime)}</span>
                <div className="flex-1 h-1 bg-white/10 rounded-full cursor-pointer group" onClick={seek}>
                  <div className="h-full bg-white/70 group-hover:bg-white rounded-full transition-[width] duration-150" style={{ width: `${progress}%` }} />
                </div>
                <span className="w-10 tabular-nums">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right controls */}
            <div className="items-center gap-1 sm:gap-2 w-20 sm:w-40 justify-end flex-shrink-0 hidden sm:flex">
              <button
                onClick={() => toggleLike(currentSong)}
                className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              >
                <Heart className={`w-4 h-4 transition-colors ${likedSongs.has(currentSong.videoId) ? 'fill-red-500 text-red-500' : 'text-neutral-400 hover:text-white'}`} />
              </button>
              <button onClick={() => setShowQueue(!showQueue)} className={`p-1.5 rounded-full transition-colors ${showQueue ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white hover:bg-white/10'}`}>
                <ListMusic className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1">
                <button onClick={toggleMute} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-neutral-400 hover:text-white">
                  <VolumeIcon className="w-4 h-4" />
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => { setVolume(parseFloat(e.target.value)); setMuted(false); prevVolumeRef.current = parseFloat(e.target.value) }}
                  className="w-20 h-1 cursor-pointer"
                />
              </div>
            </div>

            {/* Mobile-only controls */}
            <div className="flex items-center gap-1 sm:hidden flex-shrink-0">
              <button onClick={() => setShowQueue(!showQueue)} className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-neutral-400">
                <ListMusic className="w-4 h-4" />
              </button>
              <button onClick={toggleMute} className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-neutral-400">
                <VolumeIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}