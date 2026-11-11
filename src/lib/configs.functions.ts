import { createServerFn } from "@tanstack/react-start";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { configs } from "@/db/schema";

const CONFIG_KEY = "app_config";

import { type AppConfig, appConfigSchema, DEFAULT_APP_CONFIG } from "@/types/app-config";

export { type AppConfig, appConfigSchema, DEFAULT_APP_CONFIG };
export const getAppConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<AppConfig> => {
    const [row] = await db.select().from(configs).where(sql`${configs.key} = ${CONFIG_KEY}`);
    const parsed = appConfigSchema.safeParse(row?.value ?? {});
    return parsed.success ? parsed.data : DEFAULT_APP_CONFIG;
  },
);

export const updateAppConfig = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof appConfigSchema>) => appConfigSchema.parse(data))
  .handler(async ({ data }): Promise<AppConfig> => {
    await db
      .insert(configs)
      .values({ key: CONFIG_KEY, value: data })
      .onConflictDoUpdate({
        target: configs.key,
        set: { value: data },
      });
    return data;
  });
