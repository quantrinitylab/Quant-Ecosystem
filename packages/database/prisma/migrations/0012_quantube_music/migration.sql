-- QuantTube Music (YouTube Music / Spotify): a music catalog of albums + tracks
-- with streaming metadata and play counts.

-- CreateTable
CREATE TABLE "music_albums" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "artworkUrl" TEXT,
    "releaseDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music_tracks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "albumId" TEXT,
    "audioUrl" TEXT NOT NULL,
    "artworkUrl" TEXT,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "genre" TEXT,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "music_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "music_albums_artistName_idx" ON "music_albums"("artistName");

-- CreateIndex
CREATE INDEX "music_tracks_albumId_idx" ON "music_tracks"("albumId");

-- CreateIndex
CREATE INDEX "music_tracks_artistName_idx" ON "music_tracks"("artistName");

-- AddForeignKey
ALTER TABLE "music_tracks" ADD CONSTRAINT "music_tracks_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "music_albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;
