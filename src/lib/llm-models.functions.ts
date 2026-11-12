import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { llmModels, llmServices } from "@/db/schema";
import { t } from "@/i18n";
import type { LLMModelMetadata, LLMType } from "@/types/llm";
import { fetchRemoteLLMModels } from "./llm-services.functions";

export interface LLMModelListItem {
  id: number;
  llmServiceId: number;
  llmServiceName: string;
  llmServiceType: LLMType;
  key: string;
  name: string;
  description: string | null;
  metadata: LLMModelMetadata | null;
  enabled: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

const listColumns = {
  id: llmModels.id,
  llmServiceId: llmModels.llmServiceId,
  llmServiceName: llmServices.name,
  llmServiceType: llmServices.type,
  key: llmModels.key,
  name: llmModels.name,
  description: llmModels.description,
  metadata: llmModels.metadata,
  enabled: llmModels.enabled,
  createdAt: llmModels.createdAt,
  updatedAt: llmModels.updatedAt,
};

export const listLLMModels = createServerFn({ method: "GET" }).handler(
  async (): Promise<LLMModelListItem[]> => {
    return db
      .select(listColumns)
      .from(llmModels)
      .innerJoin(llmServices, eq(llmModels.llmServiceId, llmServices.id))
      .orderBy(llmServices.createdAt, llmModels.createdAt);
  },
);

const idSchema = z.object({ id: z.number().int().positive() });

const baseFields = {
  llmServiceId: z.number().int().positive(),
  key: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a model ID") })
    .max(200),
  name: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a display name") })
    .max(200),
  description: z.string().trim().max(500).nullable().optional(),
};

export const createLLMModelSchema = z.object(baseFields);
export const updateLLMModelSchema = z.object({
  id: z.number().int().positive(),
  ...baseFields,
});

const toggleSchema = z.object({
  id: z.number().int().positive(),
  enabled: z.boolean(),
});

export const createLLMModel = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof createLLMModelSchema>) => createLLMModelSchema.parse(data))
  .handler(async ({ data }): Promise<LLMModelListItem> => {
    const now = new Date();
    const [created] = await db
      .insert(llmModels)
      .values({
        llmServiceId: data.llmServiceId,
        key: data.key,
        name: data.name,
        description: data.description ? data.description : null,
        metadata: null,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: llmModels.id });
    const [row] = await db
      .select(listColumns)
      .from(llmModels)
      .innerJoin(llmServices, eq(llmModels.llmServiceId, llmServices.id))
      .where(eq(llmModels.id, created.id));
    if (!row) throw new Error(t("Creation failed"));
    return row;
  });

export const updateLLMModel = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof updateLLMModelSchema>) => updateLLMModelSchema.parse(data))
  .handler(async ({ data }): Promise<LLMModelListItem> => {
    const now = new Date();
    await db
      .update(llmModels)
      .set({
        key: data.key,
        name: data.name,
        description: data.description ? data.description : null,
        updatedAt: now,
      })
      .where(eq(llmModels.id, data.id));
    const [row] = await db
      .select(listColumns)
      .from(llmModels)
      .innerJoin(llmServices, eq(llmModels.llmServiceId, llmServices.id))
      .where(eq(llmModels.id, data.id));
    if (!row) throw new Error(t("Model not found"));
    return row;
  });

export const toggleLLMModel = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof toggleSchema>) => toggleSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await db
      .update(llmModels)
      .set({ enabled: data.enabled, updatedAt: new Date() })
      .where(eq(llmModels.id, data.id));
    return { ok: true as const };
  });

export const deleteLLMModel = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await db.delete(llmModels).where(eq(llmModels.id, data.id));
    return { ok: true as const };
  });

export const syncLLMModels = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(
    async ({
      data,
    }): Promise<{
      added: number;
      updated: number;
      removed: number;
      total: number;
    }> => {
      const [svc] = await db.select().from(llmServices).where(eq(llmServices.id, data.id));
      if (!svc) throw new Error(t("LLM service not found"));

      const remote = await fetchRemoteLLMModels(svc.type, svc.baseUrl, svc.apiKey);
      const existing = await db.select().from(llmModels).where(eq(llmModels.llmServiceId, svc.id));

      const existingByKey = new Map(existing.map((m) => [m.key, m]));
      const remoteKeys = new Set(remote.map((m) => m.key));
      const now = new Date();

      let added = 0;
      let updated = 0;

      for (const r of remote) {
        const cur = existingByKey.get(r.key);
        if (!cur) {
          await db.insert(llmModels).values({
            llmServiceId: svc.id,
            key: r.key,
            name: r.name,
            description: r.description,
            metadata: null,
            enabled: true,
            createdAt: now,
            updatedAt: now,
          });
          added += 1;
        } else {
          const changed = cur.name !== r.name || (cur.description ?? null) !== r.description;
          if (changed) {
            await db
              .update(llmModels)
              .set({
                name: r.name,
                description: r.description,
                updatedAt: now,
              })
              .where(eq(llmModels.id, cur.id));
            updated += 1;
          }
        }
      }

      const stale = existing.filter((m) => !remoteKeys.has(m.key));
      let removed = 0;
      if (stale.length > 0) {
        await db.delete(llmModels).where(
          and(
            eq(llmModels.llmServiceId, svc.id),
            inArray(
              llmModels.id,
              stale.map((m) => m.id),
            ),
          ),
        );
        removed = stale.length;
      }

      return { added, updated, removed, total: remote.length };
    },
  );
