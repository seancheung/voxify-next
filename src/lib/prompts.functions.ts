import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { type PromptRow, prompts } from "@/db/schema";
import { t } from "@/i18n";

export type PromptListItem = PromptRow;

export const listPrompts = createServerFn({ method: "GET" }).handler(
  async (): Promise<PromptListItem[]> => {
    return db.select().from(prompts).orderBy(prompts.createdAt);
  },
);

const idSchema = z.object({ id: z.number().int().positive() });

const baseFields = {
  name: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter a name") })
    .max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  content: z
    .string()
    .trim()
    .min(1, { error: () => t("Enter prompt content") })
    .max(20_000),
};

export const createPromptSchema = z.object(baseFields);
export const updatePromptSchema = z.object({
  id: z.number().int().positive(),
  ...baseFields,
});

const toggleSchema = z.object({
  id: z.number().int().positive(),
  enabled: z.boolean(),
});

export const createPrompt = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof createPromptSchema>) => createPromptSchema.parse(data))
  .handler(async ({ data }): Promise<PromptRow> => {
    const now = new Date();
    const [created] = await db
      .insert(prompts)
      .values({
        name: data.name,
        description: data.description ? data.description : null,
        content: data.content,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created;
  });

export const updatePrompt = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof updatePromptSchema>) => updatePromptSchema.parse(data))
  .handler(async ({ data }): Promise<PromptRow> => {
    const now = new Date();
    const [updated] = await db
      .update(prompts)
      .set({
        name: data.name,
        description: data.description ? data.description : null,
        content: data.content,
        updatedAt: now,
      })
      .where(eq(prompts.id, data.id))
      .returning();
    if (!updated) throw new Error(t("Prompt not found"));
    return updated;
  });

export const togglePrompt = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof toggleSchema>) => toggleSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await db
      .update(prompts)
      .set({ enabled: data.enabled, updatedAt: new Date() })
      .where(eq(prompts.id, data.id));
    return { ok: true as const };
  });

export const deletePrompt = createServerFn({ method: "POST" })
  .validator((data: z.input<typeof idSchema>) => idSchema.parse(data))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await db.delete(prompts).where(eq(prompts.id, data.id));
    return { ok: true as const };
  });

const DEFAULT_PROMPT_PLAIN_ZH = {
  get name() {
    return t("Default · Chinese segmentation");
  },
  get description() {
    return t("Split Chinese text into short segments, one per line, without character labels");
  },
  content: `你是一个中文剧本格式化助手。请将用户提供的整段文本按下列规则重新分段输出：

1. 每一行表示一个独立段落，行与行之间只有一个换行符；不允许出现空行或多余空白行。
2. 每个段落以 50 字以内为佳；优先按断句标点（。！？；：…!?;:）进行拆分。本规则中所说的“字数”仅统计文字字符，不计入任何标点符号与空白。
3. 若某句话过长（文字字数明显超过 50 字），允许在该句内部按逗号、顿号（，、,）继续拆分到合适长度，但应选择语义完整的位置切分，避免把短语硬切开。
4. 紧跟在断句标点或逗号后的右引号、右括号（如 ”、）、" ）保留在该行末尾，不要单独成行。
5. 每一行只能属于一种“声音”，因为最终会用不同的人声配音。不允许把对白和旁白放在同一行，也不允许把不同角色的对白放在同一行：
   - 引号包裹的对白（如 “…”、"…"、'…'）必须单独成行；
   - 对白前后的引导语 / 动作描写 / 心理提示（如“她说”、“他笑道：”、“小明叹了口气，”、“她想：”）属于旁白，必须与引号内的对白拆到不同的行；
   - 不同角色的对白各自独立成行。
   即使每段都很短也不要合并。
   错误示例：小红笑道：“那好吧，我答应你。”
   正确示例（拆成两行）：
   小红笑道：
   “那好吧，我答应你。”
6. 严禁新增、删除、改写、翻译、解释、润色或合并原文文字与标点，只对原文进行换行调整。
7. 不要输出任何编号、序号、Markdown、前言、总结、解释或代码块包裹，仅输出处理后的纯文本。

请直接输出格式化后的结果。`,
};

const DEFAULT_PROMPT_NARRATED_ZH = {
  get name() {
    return t("Default · Chinese speaker identification");
  },
  get description() {
    return t("Split Chinese text and add speaker tags to each segment, including narration");
  },
  content: `你是一个中文剧本格式化与角色识别助手。请将用户提供的整段文本重新分段，并在每段开头标注讲话人：

1. 每一行表示一个独立段落，行与行之间只有一个换行符；不允许出现空行或多余空白行。
2. 每个段落以 50 字以内为佳；优先按断句标点（。！？；：…!?;:）进行拆分。本规则中所说的“字数”仅统计文字字符，不计入任何标点符号与空白，也不计入开头的 [[角色名]] 标注。
3. 若某句话过长（文字字数明显超过 50 字），允许在该句内部按逗号、顿号（，、,）继续拆分到合适长度，但应选择语义完整的位置切分，避免把短语硬切开。
4. 紧跟在断句标点或逗号后的右引号、右括号（如 ”、）、" ）保留在该行末尾，不要单独成行。
5. 每一行只能属于一种“声音”，因为最终会用不同的人声配音。不允许把对白和旁白放在同一行，也不允许把不同角色的对白放在同一行；拆分后各自独立成行，并加上对应的 [[角色名]] 或 [[旁白]] 标注：
   - 引号包裹的对白（如 “…”、"…"、'…'）单独成行，标注对应说话角色；
   - 对白前后的引导语 / 动作描写 / 心理提示（如“她说”、“他笑道：”、“小明叹了口气，”、“她想：”）属于旁白，单独成行，标注 [[旁白]]；
   - 不同角色的对白各自独立成行。
   即使每段都很短也不要合并。
   错误示例：[[小红]]小红笑道：“那好吧，我答应你。”
   正确示例（拆成两行）：
   [[旁白]]小红笑道：
   [[小红]]“那好吧，我答应你。”
6. 在每一段开头加上角色标注，格式为 [[角色名]]，紧接段落正文，例如：[[旁白]]从前有一座山。
7. 叙述、描写、环境、心理旁白等非具体角色台词，统一使用 [[旁白]]。
8. 当一段为某个具体角色的台词或心理独白时，使用该角色的名字，如 [[小明]]、[[国王]]。原文未给出明确姓名时，可基于上下文使用稳定的代称（如 [[少年]]、[[老人]]、[[角色1]]），同一角色在全文中必须保持同一名称。
9. 同一角色的连续段落每段都必须重复 [[角色名]]，不要省略。
10. 严禁新增、删除、改写、翻译、解释、润色或合并原文文字与标点；除每段开头的 [[角色名]] 标注外，原文内容不得改动。
11. 不要输出任何编号、序号、Markdown、前言、总结、解释或代码块包裹，仅输出处理后的纯文本。

请直接输出格式化后的结果。`,
};

const DEFAULT_PROMPT_PLAIN_EN = {
  get name() {
    return t("Default · English segmentation");
  },
  get description() {
    return t("Split English text into short segments, one per line, without character labels");
  },
  content: `You are an English script formatter. Reformat the user-provided text into short paragraphs by following these rules:

1. Each line is one paragraph; lines are separated by a single newline. No empty lines or extra whitespace lines are allowed.
2. Aim for at most about 15 words per paragraph; split first on terminal punctuation (. ! ? ; : …). The "word count" referenced in these rules counts whitespace-separated word tokens only; punctuation, spaces, and other non-word characters are not counted.
3. If a single sentence is clearly longer than ~15 words, you may further split it on commas (,) or semicolons inside that sentence. Choose semantically natural break points and do not break tightly-bound phrases.
4. A closing quote or bracket immediately following terminal punctuation or a comma (e.g. ." ," ?" ;)") stays at the end of the line; never put it on its own line.
5. Each line must belong to a single "voice", since each line will be voiced by a different speaker. Never mix dialogue with narration on the same line, and never mix dialogue from different speakers:
   - Quoted speech ("…", "…", '…') must be on its own line.
   - Dialogue tags or accompanying action / thought attribution (e.g. "she said,", "he laughed,", "Tom whispered,", "Mary thought:") is narration and must be split off from the quoted speech onto its own line.
   - Different speakers' dialogue must each be on its own line.
   Even when each part is short, do not merge them.
   Wrong: Mary laughed, "All right, I agree."
   Correct (split into two lines):
   Mary laughed,
   "All right, I agree."
6. Do not add, remove, rewrite, translate, paraphrase, summarize, or merge the original wording or punctuation; only adjust line breaks.
7. Do not output any numbering, list markers, Markdown, preamble, summary, explanation, or code fences. Output only the formatted plain text.

Output the formatted result directly.`,
};

const DEFAULT_PROMPT_NARRATED_EN = {
  get name() {
    return t("Default · English speaker identification");
  },
  get description() {
    return t(
      "Split English text and label speakers with [[Speaker]] and narration with [[Narrator]]",
    );
  },
  content: `You are an English script formatter and speaker recognizer. Reformat the user-provided text into short paragraphs and tag the speaker of each paragraph:

1. Each line is one paragraph; lines are separated by a single newline. No empty lines or extra whitespace lines are allowed.
2. Aim for at most about 15 words per paragraph; split first on terminal punctuation (. ! ? ; : …). The "word count" referenced in these rules counts whitespace-separated word tokens only; punctuation, spaces, and the leading [[Speaker]] tag are not counted.
3. If a single sentence is clearly longer than ~15 words, you may further split it on commas (,) or semicolons inside that sentence. Choose semantically natural break points and do not break tightly-bound phrases.
4. A closing quote or bracket immediately following terminal punctuation or a comma (e.g. ." ," ?" ;)") stays at the end of the line; never put it on its own line.
5. Each line must belong to a single "voice", since each line will be voiced by a different speaker. Never mix dialogue with narration on the same line, and never mix dialogue from different speakers; split such content into separate lines and tag each with its own [[Speaker]] or [[Narrator]]:
   - Quoted speech ("…", "…", '…') is on its own line, tagged with the speaker's name.
   - Dialogue tags or accompanying action / thought attribution (e.g. "she said,", "he laughed,", "Tom whispered,", "Mary thought:") is narration; put it on its own line tagged [[Narrator]].
   - Different speakers' dialogue must each be on its own line.
   Even when each part is short, do not merge them.
   Wrong: [[Mary]]Mary laughed, "All right, I agree."
   Correct (split into two lines):
   [[Narrator]]Mary laughed,
   [[Mary]]"All right, I agree."
6. Begin every paragraph with a speaker tag of the form [[Speaker]] immediately followed by the paragraph text, e.g. [[Narrator]]Once upon a time, there was a mountain.
7. Use [[Narrator]] for narration, description, scene-setting, and any inner narration that is not attributed to a specific character.
8. When a paragraph is the dialogue or inner monologue of a specific character, use that character's name (e.g. [[Tom]], [[The King]]). If the original text does not name them, you may use a stable referent based on context (e.g. [[The Boy]], [[The Old Man]], [[Character 1]]); a given character must keep the same name throughout the whole text.
9. Repeat the [[Speaker]] tag for every consecutive paragraph spoken by the same character; never omit it.
10. Do not add, remove, rewrite, translate, paraphrase, summarize, or merge the original wording or punctuation; aside from the leading [[Speaker]] tag, the original content must not be changed.
11. Do not output any numbering, list markers, Markdown, preamble, summary, explanation, or code fences. Output only the formatted plain text.

Output the formatted result directly.`,
};

export const importDefaultPrompts = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ inserted: number }> => {
    const now = new Date();
    const defaults = [
      DEFAULT_PROMPT_PLAIN_ZH,
      DEFAULT_PROMPT_NARRATED_ZH,
      DEFAULT_PROMPT_PLAIN_EN,
      DEFAULT_PROMPT_NARRATED_EN,
    ];
    const created = await db
      .insert(prompts)
      .values(
        defaults.map((p) => ({
          name: p.name,
          description: p.description,
          content: p.content,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .returning({ id: prompts.id });
    return { inserted: created.length };
  },
);
