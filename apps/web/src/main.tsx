import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import type { QueueItem, Room, Video } from "@encore/types";
import "./index.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
const socket = io(API, { autoConnect: false });
const codeFromUrl =
  new URLSearchParams(location.search).get("room")?.toUpperCase() || "";
const hostTokenKey = (code: string) => `encore:host:${code}`;
const displayNameKey = "encore:display-name";

type YouTubePlayerInstance = {
  loadVideoById: (videoId: string) => void;
  destroy: () => void;
};
type YouTubeApi = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: { onStateChange: (event: { data: number }) => void };
    },
  ) => YouTubePlayerInstance;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | undefined;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve, reject) => {
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        if (window.YT) resolve(window.YT);
      };
      const script = document.querySelector<HTMLScriptElement>(
        'script[src="https://www.youtube.com/iframe_api"]',
      );
      if (script) {
        script.addEventListener("error", () => reject(new Error("YouTube player failed to load")), {
          once: true,
        });
      } else {
        const apiScript = document.createElement("script");
        apiScript.src = "https://www.youtube.com/iframe_api";
        apiScript.onerror = () => reject(new Error("YouTube player failed to load"));
        document.head.appendChild(apiScript);
      }
    });
  }
  return youtubeApiPromise;
}

function YouTubePlayer({
  videoId,
  onEnded,
}: {
  videoId?: string;
  onEnded: () => void;
}) {
  const playerHost = useRef<HTMLDivElement>(null);
  const player = useRef<YouTubePlayerInstance | null>(null);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    if (!videoId) {
      player.current?.destroy();
      player.current = null;
      return;
    }
    let cancelled = false;
    loadYouTubeApi()
      .then((api) => {
        if (cancelled || !playerHost.current) return;
        if (player.current) {
          player.current.loadVideoById(videoId);
          return;
        }
        player.current = new api.Player(playerHost.current, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1, rel: 0, origin: location.origin },
          events: {
            onStateChange: (event) => {
              if (event.data === 0) onEndedRef.current();
            },
          },
        });
      })
      .catch((error) => console.error("[Encore] YouTube player failed to load", error));
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  useEffect(
    () => () => {
      player.current?.destroy();
      player.current = null;
    },
    [],
  );

  if (!videoId)
    return (
      <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_50%_35%,#9c3f79,transparent_30%),#241831]">
        <div className="text-center">
          <p className="font-display text-3xl">Your stage is ready.</p>
          <p className="mt-2 text-sm text-white/50">
            Add a karaoke video to start the party.
          </p>
        </div>
      </div>
    );
  return <div ref={playerHost} className="h-full w-full" />;
}

function Queue({
  room,
  host,
  onSkip,
}: {
  room: Room;
  host: boolean;
  onSkip: () => void;
}) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="eyebrow">UP NEXT</p>
          <h2 className="font-display text-2xl">
            Party queue{" "}
            <span className="font-sans text-xs text-white/40">
              {room.queue.length} songs
            </span>
          </h2>
        </div>
        {host && (
          <button onClick={onSkip} className="ghost">
            Skip song
          </button>
        )}
      </div>
      <div className="divide-y divide-white/5">
        {room.queue.length ? (
          room.queue.map((song, i) => (
            <QueueRow key={song.id} song={song} position={i + 1} />
          ))
        ) : (
          <p className="py-8 text-center text-sm text-white/45">
            The queue is waiting for a first song.
          </p>
        )}
      </div>
    </section>
  );
}
function QueueRow({ song, position }: { song: QueueItem; position: number }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="w-5 text-xs text-white/30">
        {String(position).padStart(2, "0")}
      </span>
      <img
        className="h-10 w-14 rounded object-cover"
        src={song.thumbnailUrl}
        alt=""
      />
      <div className="min-w-0 flex-1">
        <b className="block truncate text-sm">{song.title}</b>
        <span className="block truncate text-xs text-white/45">
          Added by {song.addedBy}
        </span>
      </div>
    </div>
  );
}

function Search({
  room,
  onAdded,
  userName,
}: {
  room: Room;
  onAdded: () => void;
  userName: string;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(
    "Search YouTube for a karaoke version, then add it to the shared queue.",
  );
  async function search() {
    if (!query.trim()) {
      setItems([]);
      setMessage("Enter a song title or artist before searching.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `${API}/api/videos/search?q=${encodeURIComponent(query)}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed");
      setItems(data.items || []);
      if (!data.items?.length)
        setMessage(
          "No embeddable karaoke videos found. Try a different title or artist.",
        );
    } catch (error) {
      setItems([]);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not search YouTube right now.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function add(video: Video) {
    const response = await fetch(`${API}/api/rooms/${room.code}/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...video, addedBy: userName }),
    });
    if (!response.ok) {
      setMessage("Could not add that song. Please try again.");
      return;
    }
    setMessage(`Added “${video.title}” to the queue.`);
    onAdded();
  }
  return (
    <section id="song-search" className="panel scroll-mt-5 p-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="eyebrow">YOUTUBE KARAOKE</p>
          <h2 className="font-display text-2xl">Find your moment</h2>
        </div>
        <span className="rounded-full bg-lime/10 px-2 py-1 text-[10px] font-bold text-lime">
          ADD TO QUEUE
        </span>
      </div>
      <div className="flex gap-2">
        <input
          id="song-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm outline-none placeholder:text-white/35 focus:border-lime"
          placeholder="Search karaoke songs on YouTube"
        />
        <button onClick={search} disabled={loading} className="action px-4">
          {loading ? "Searching…" : "Search"}
        </button>
      </div>
      {message && <p className="mt-3 text-sm text-white/55">{message}</p>}
      <div className="mt-3 divide-y divide-white/5">
        {items.map((video) => (
          <div className="flex items-center gap-3 py-3" key={video.youtubeId}>
            <img
              className="h-10 w-14 rounded object-cover"
              src={video.thumbnailUrl}
              alt=""
            />
            <div className="min-w-0 flex-1">
              <b className="block truncate text-sm">{video.title}</b>
              <span className="block truncate text-xs text-white/45">
                {video.channelTitle}
              </span>
            </div>
            <button onClick={() => add(video)} className="action">
              + Add
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function GuestRoom({
  room,
  onAdded,
  userName,
}: {
  room: Room;
  onAdded: () => void;
  userName: string;
}) {
  const [inviteCopied, setInviteCopied] = useState(false);
  const invite = `${location.origin}?room=${room.code}`;
  const copyInvite = async () => {
    await navigator.clipboard.writeText(invite);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };
  const openSearch = () => {
    document
      .getElementById("song-search")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(
      () => document.getElementById("song-search-input")?.focus(),
      350,
    );
  };
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_85%_0%,#442958,transparent_30%),#100e1b]">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-6">
        <div className="font-display text-2xl">
          <span className="mr-2 rounded bg-lime px-2 py-1 font-sans text-sm text-ink">
            E
          </span>
          encore
        </div>
        <div className="text-right">
          <p className="eyebrow">YOU JOINED AS</p>
          <b className="block truncate text-sm">{userName}</b>
          <div className="mt-1 flex items-center justify-end gap-2">
            <b className="tracking-[.18em]">{room.code}</b>
            <button onClick={copyInvite} className="ghost px-3 py-1 text-xs">
              {inviteCopied ? "Copied!" : "Invite"}
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-5 px-5 pb-10">
        <section className="panel overflow-hidden">
          <div className="bg-[radial-gradient(circle_at_25%_10%,#75406d,transparent_40%),#241b30] p-6">
            <p className="eyebrow">NOW SINGING ON THE TV</p>
            <h1 className="mt-2 font-display text-3xl">
              {room.currentItem?.title || "The stage is waiting"}
            </h1>
            <p className="mt-2 text-sm text-white/55">
              {room.currentItem?.channelTitle ||
                "Add the first song to get the party started."}
            </p>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 px-6 py-4">
            <span className="text-xs text-white/50">
              You control the queue, not playback.
            </span>
            <button onClick={openSearch} className="action">
              + Add a song
            </button>
          </div>
        </section>
        <Search room={room} onAdded={onAdded} userName={userName} />
        <Queue room={room} host={false} onSkip={() => undefined} />
      </div>
    </main>
  );
}

function App() {
  const [room, setRoom] = useState<Room | null>(null);
  const [code, setCode] = useState(codeFromUrl);
  const [name, setName] = useState("Friday night singalong");
  const [userName, setUserName] = useState(
    () => localStorage.getItem(displayNameKey) || "",
  );
  const [host, setHost] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const advancingSong = useRef(false);
  const join = async (create = false) => {
    setError("");
    const displayName = userName.trim();
    if (!displayName) {
      setError("Enter your name before starting or joining a party.");
      return;
    }
    if (create) setStarting(true);
    const requestUrl = create
      ? `${API}/api/rooms`
      : `${API}/api/rooms/${code}`;
    try {
      const response = await fetch(
        requestUrl,
        {
          method: create ? "POST" : "GET",
          headers: create ? { "Content-Type": "application/json" } : undefined,
          body: create ? JSON.stringify({ name }) : undefined,
        },
      );
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        setError(
          create
            ? `Could not start the party${detail?.error ? `: ${detail.error}` : ". Check that the API and database are running."}`
            : response.status === 404
              ? "Room not found. Check the code and try again."
              : "Could not join this room. Please try again.",
        );
        return;
      }
      const data: Room = await response.json();
      localStorage.setItem(displayNameKey, displayName);
      setRoom(data);
      setCode(data.code);
      const token = create
        ? data.hostToken
        : localStorage.getItem(hostTokenKey(data.code));
      setHost(Boolean(token));
      if (data.hostToken)
        localStorage.setItem(hostTokenKey(data.code), data.hostToken);
      history.replaceState(null, "", `?room=${data.code}`);
      socket.connect();
      socket.emit("room:join", data.code);
    } catch (error) {
      console.error("[Encore] Party service request failed", {
        action: create ? "create room" : "join room",
        apiBaseUrl: API,
        requestUrl,
        roomCode: create ? undefined : code,
        error,
      });
      setError(
        create
          ? "Could not reach the party service. Start the API and PostgreSQL, then try again."
          : "Could not reach the party service. Please try again.",
      );
    } finally {
      if (create) setStarting(false);
    }
  };
  useEffect(() => {
    socket.on("room:updated", (updated: Room) => setRoom(updated));
    return () => {
      socket.off("room:updated");
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    if (codeFromUrl) join(false);
  }, []);
  const refresh = () => socket.emit("room:join", room?.code);
  const skip = async () => {
    if (!room || advancingSong.current) return;
    advancingSong.current = true;
    try {
      await fetch(`${API}/api/rooms/${room.code}/skip`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-host-token": localStorage.getItem(hostTokenKey(room.code)) || "",
        },
      });
      refresh();
    } finally {
      advancingSong.current = false;
    }
  };
  if (!room)
    return (
      <main className="grid min-h-screen place-items-center overflow-hidden bg-[radial-gradient(circle_at_80%_0%,#57377f,transparent_35%),radial-gradient(circle_at_10%_100%,#7e315c,transparent_35%)] p-5">
        <div className="panel w-full max-w-md p-8">
          <div className="mb-8 flex items-center gap-2 font-display text-3xl">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-lime font-sans text-lg text-ink">
              E
            </span>
            encore
          </div>
          <p className="eyebrow">KARAOKE, TOGETHER</p>
          <h1 className="mt-2 font-display text-4xl">Pass the mic around.</h1>
          <p className="mt-3 text-sm leading-6 text-white/55">
            Host the playback on this screen, then let every guest build the
            party queue from their phone.
          </p>
          <label className="mt-7 block text-xs font-bold text-white/65">
            Party name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-3 text-sm outline-none focus:border-lime"
            />
          </label>
          <label className="mt-4 block text-xs font-bold text-white/65">
            Your name
            <input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-3 text-sm outline-none focus:border-lime"
              placeholder="Your karaoke name"
              maxLength={50}
            />
          </label>
          <button
            disabled={starting}
            onClick={() => join(true)}
            className="action mt-4 w-full py-3"
          >
            {starting ? "Starting party…" : "Start a party →"}
          </button>
          <div className="my-6 h-px bg-white/10" />
          <label className="block text-xs font-bold text-white/65">
            Your name
            <input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-3 text-sm outline-none focus:border-lime"
              placeholder="Your karaoke name"
              maxLength={50}
            />
          </label>
          <label className="block text-xs font-bold text-white/65">
            Have a room code?
            <div className="mt-2 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/20 px-3 py-3 text-sm tracking-[.2em] outline-none focus:border-lime"
                placeholder="F9K8"
              />
              <button onClick={() => join(false)} className="ghost">
                Join
              </button>
            </div>
          </label>
          {error && <p className="mt-3 text-xs text-pink-300">{error}</p>}
        </div>
      </main>
    );
  if (!host)
    return <GuestRoom room={room} onAdded={refresh} userName={userName.trim()} />;
  const invite = `${location.origin}?room=${room.code}`;
  const copyInvite = async () => {
    await navigator.clipboard.writeText(invite);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_80%_0%,#442958,transparent_30%),#100e1b]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6">
        <div className="font-display text-2xl">
          <span className="mr-2 rounded bg-lime px-2 py-1 font-sans text-sm text-ink">
            E
          </span>
          encore
        </div>
        <div className="flex items-center gap-4">
          <button onClick={copyInvite} className="action">
            {inviteCopied ? "Invite copied!" : "Invite"}
          </button>
          <div className="text-right">
            <p className="eyebrow">HOST: {userName.trim()}</p>
            <b className="tracking-[.2em]">{room.code}</b>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-5 px-5 pb-10 lg:grid-cols-[1.65fr_.85fr]">
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
          <div className="aspect-video">
            <YouTubePlayer videoId={room.currentItem?.youtubeId} onEnded={skip} />
          </div>
          <div className="flex items-center justify-between bg-[#211a2d] p-5">
            <div>
              <p className="eyebrow">NOW SINGING</p>
              <h1 className="font-display text-xl">
                {room.currentItem?.title || "Waiting for the first singer"}
              </h1>
              <p className="mt-1 text-xs text-white/45">
                {room.currentItem?.channelTitle ||
                  "Search YouTube karaoke videos to begin"}
              </p>
            </div>
            <button onClick={skip} className="action">
              {room.currentItem ? "Skip song →" : "Start song →"}
            </button>
          </div>
        </section>
        <aside className="panel p-6">
          <p className="eyebrow">INVITE THE CREW</p>
          <h2 className="mt-1 font-display text-3xl">Pass the mic around.</h2>
          <p className="mt-3 text-sm leading-6 text-white/55">
            Friends can add songs from their phone. Playback stays right here.
          </p>
          <div className="my-5 grid h-32 w-32 place-items-center rounded-xl bg-white text-center text-xs font-bold text-ink [background-image:repeating-linear-gradient(90deg,transparent_0,transparent_7px,#100e1b_7px,#100e1b_10px),repeating-linear-gradient(0deg,transparent_0,transparent_7px,#100e1b_7px,#100e1b_10px)]">
            <span className="rounded bg-lime p-2">E</span>
          </div>
          <p className="break-all rounded-lg bg-black/20 p-3 font-mono text-[10px] text-white/55">
            {invite}
          </p>
          <button
            onClick={copyInvite}
            className="action mt-3 w-full"
          >
            {inviteCopied ? "Invite link copied!" : "Copy invite link"}
          </button>
        </aside>
        <Queue room={room} host onSkip={skip} />
        <Search room={room} onAdded={refresh} userName={userName.trim()} />
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
