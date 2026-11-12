import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { segments, ttsGenerations } from "@/db/schema";
import { t } from "@/i18n";
import { finalizeUpload } from "@/lib/files.server";
import { buildObjectKey, deleteObject, uploadObject } from "@/lib/storage.server";

export const saveEditedAudio = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }) => {
    const id = z.coerce.number().int().positive();
    const segmentId = id.parse(data.get("segmentId"));
    const generationId = id.parse(data.get("generationId"));
    const audio = data.get("audio");
    const maxBytes = 50 * 1024 * 1024;
    if (!(audio instanceof Blob) || audio.size <= 44 || audio.size > maxBytes)
      throw new Error(t("Audio is empty or exceeds 50 MB"));
    const bytes = Buffer.from(await audio.arrayBuffer());
    const channels = bytes.readUInt16LE(22);
    const rate = bytes.readUInt32LE(24);
    if (
      bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.toString("ascii", 8, 16) !== "WAVEfmt " ||
      bytes.readUInt32LE(16) !== 16 ||
      bytes.readUInt16LE(20) !== 1 ||
      bytes.readUInt16LE(34) !== 16 ||
      !channels ||
      !rate ||
      bytes.toString("ascii", 36, 40) !== "data" ||
      bytes.readUInt32LE(40) !== bytes.length - 44 ||
      (bytes.length - 44) % (2 * channels) !== 0
    )
      throw new Error(t("Invalid PCM WAV audio"));
    const path = buildObjectKey("audio", "audio/wav");
    try {
      await uploadObject(path, bytes);
      db.transaction((tx) => {
        const source = tx
          .select()
          .from(ttsGenerations)
          .where(and(eq(ttsGenerations.id, generationId), eq(ttsGenerations.segmentId, segmentId)))
          .get();
        if (!source) throw new Error(t("Source audio version not found"));
        const durationMs = Math.max(
          1,
          Math.round(((bytes.length - 44) * 1000) / (2 * channels * rate)),
        );
        const file = finalizeUpload(
          {
            path,
            fileName: `segment-${segmentId}.wav`,
            maxBytes,
            fileSize: bytes.length,
            fileMime: "audio/wav",
            durationMs,
          },
          tx,
        );
        const now = new Date();
        const version = tx
          .insert(ttsGenerations)
          .values({
            projectId: source.projectId,
            editedFromGenerationId: source.id,
            segmentId,
            fileId: file.id,
            payload: source.payload,
            serviceUrl: source.serviceUrl,
            createdAt: now,
          })
          .returning({ id: ttsGenerations.id })
          .get();
        const updated = tx
          .update(segments)
          .set({ generationId: version.id, updatedAt: now })
          .where(and(eq(segments.id, segmentId), eq(segments.generationId, generationId)))
          .run();
        if (!updated.changes)
          throw new Error(t("The audio version changed. Reopen the audio editor."));
      });
    } catch (error) {
      await deleteObject(path);
      throw error;
    }
  });
