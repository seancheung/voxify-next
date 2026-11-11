import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { chapters, narrators, segments } from "@/db/schema";
import type { CustomArgs, VoiceSettings } from "@/types/tts";

export type NarratorListItem = {
  id: number;
  projectId: number;
  name: string;
  voiceId: number | null;
  voiceSettings: VoiceSettings | null;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const projectIdSchema = z.object({
  projectId: z.number().int().positive(),
});

export type NarratorListResult = {
  items: NarratorListItem[];
  unassignedCount: number;
};

export const listNarrators = createServerFn({ method: "GET" })
  .validator((data: z.input<typeof projectIdSchema>) => projectIdSchema.parse(data))
  .handler(async ({ data }): Promise<NarratorListResult> => {
    const rows = await db
      .select({
        id: narrators.id,
        projectId: narrators.projectId,
        name: narrators.name,
        voiceId: narrators.voiceId,
        voiceSettings: narrators.voiceSettings,
        createdAt: narrators.createdAt,
        updatedAt: narrators.updatedAt,
      })
      .from(narrators)
      .where(eq(narrators.projectId, data.projectId))
      .orderBy(asc(narrators.name), asc(narrators.id));

    const [unassignedRow] = await db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(segments)
      .innerJoin(chapters, eq(chapters.id, segments.chapterId))
      .where(and(eq(chapters.projectId, data.projectId), isNull(segments.narratorId)));
    const unassignedCount = unassignedRow?.count ?? 0;

    if (rows.length === 0) return { items: [], unassignedCount };

    const usageRows = await db
      .select({
        narratorId: segments.narratorId,
        count: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(segments)
      .innerJoin(chapters, eq(chapters.id, segments.chapterId))
      .where(
        and(
          eq(chapters.projectId, data.projectId),
          inArray(
            segments.narratorId,
            rows.map((r) => r.id),
          ),
        ),
      )
      .groupBy(segments.narratorId);
    const usageById = new Map<number, number>();
    for (const row of usageRows) {
      if (row.narratorId != null) usageById.set(row.narratorId, row.count);
    }

    return {
      items: rows.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        name: r.name,
        voiceId: r.voiceId,
        voiceSettings: r.voiceSettings,
        usageCount: usageById.get(r.id) ?? 0,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      unassignedCount,
    };
  });

const voiceSettingsSchema = z
  .object({
    speed: z.string().trim().max(40).optional(),
    instructions: z.string().trim().max(2000).optional(),
    customArgs: z
      .record(z.string(), z.unknown())
      .transform((v) => v as CustomArgs)
      .optional(),
  })
  .nullable();

export const createNarratorSchema = z.object({
  projectId: z.number().int().positive(),
  name: z.string().trim().min(1, "请输入角色名称").max(120),
  voiceId: z.number().int().positive().nullable(),
  voiceSettings: voiceSettingsSchema,
});

export const createNarrator = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof createNarratorSchema>) => createNarratorSchema.parse(data))
  .handler(async ({ data }): Promise<{ id: number }> => {
    const [dup] = await db
      .select({ id: narrators.id })
      .from(narrators)
      .where(and(eq(narrators.projectId, data.projectId), eq(narrators.name, data.name)));
    if (dup) throw new Error("已存在同名角色");
    const now = new Date();
    const [created] = await db
      .insert(narrators)
      .values({
        projectId: data.projectId,
        name: data.name,
        voiceId: data.voiceId,
        voiceSettings: cleanVoiceSettings(data.voiceSettings),
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: narrators.id });
    return { id: created.id };
  });

export const updateNarratorSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1, "请输入角色名称").max(120),
  voiceId: z.number().int().positive().nullable(),
  voiceSettings: voiceSettingsSchema,
});

export const updateNarrator = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof updateNarratorSchema>) => updateNarratorSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const [current] = await db
      .select({ projectId: narrators.projectId })
      .from(narrators)
      .where(eq(narrators.id, data.id));
    if (!current) throw new Error("角色不存在");
    const [dup] = await db
      .select({ id: narrators.id })
      .from(narrators)
      .where(
        and(
          eq(narrators.projectId, current.projectId),
          eq(narrators.name, data.name),
          ne(narrators.id, data.id),
        ),
      );
    if (dup) throw new Error("已存在同名角色");
    await db
      .update(narrators)
      .set({
        name: data.name,
        voiceId: data.voiceId,
        voiceSettings: cleanVoiceSettings(data.voiceSettings),
        updatedAt: new Date(),
      })
      .where(eq(narrators.id, data.id));
    return { ok: true as const };
  });

const idSchema = z.object({ id: z.number().int().positive() });

export const deleteNarrator = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await db.delete(narrators).where(eq(narrators.id, data.id));
    return { ok: true as const };
  });

function cleanVoiceSettings(input: VoiceSettings | null | undefined): VoiceSettings | null {
  if (!input) return null;
  const speed = input.speed?.trim();
  const instructions = input.instructions?.trim();
  const customArgs =
    input.customArgs && Object.keys(input.customArgs).length > 0 ? input.customArgs : undefined;
  if (!speed && !instructions && !customArgs) return null;
  return {
    ...(speed ? { speed } : {}),
    ...(instructions ? { instructions } : {}),
    ...(customArgs ? { customArgs } : {}),
  };
}
