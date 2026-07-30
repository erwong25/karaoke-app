export type Video = { youtubeId: string; title: string; channelTitle: string; thumbnailUrl: string; duration?: string };
export type QueueItem = Video & { id: string; position: number; addedBy: string; addedAt: string };
export type Room = { code: string; name: string; hostToken?: string; currentItem?: QueueItem | null; queue: QueueItem[] };
export type RoomEvent = { type: 'room:updated'; room: Room };
