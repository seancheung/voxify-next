import { useState } from "react";
import Button from "@/components/ui/button";
import Checkbox from "@/components/ui/checkbox";
import Dialog from "@/components/ui/dialog";
import InputNumber from "@/components/ui/input-number";
import Switch from "@/components/ui/switch";
import {
  defaultRules,
  punctuationGroups,
  type QuickFormatRules,
  readFormatRules,
  rememberFormatRules,
} from "@/lib/quick-format-rules";

export default function QuickFormatDialog({
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  confirmLabel: string;
  onConfirm: (rules: QuickFormatRules) => void;
  onCancel: () => void;
}) {
  const [rules, setRules] = useState(readFormatRules);
  return (
    <Dialog
      open
      title="快速格式化规则"
      description="格式化时会删除空行，包括只有空白字符的行。"
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => setRules(defaultRules)}>
            恢复默认规则
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button
            onClick={() => {
              rememberFormatRules(rules);
              onConfirm(rules);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-5 text-sm">
        <fieldset>
          <legend className="mb-2">在这些标点后分段</legend>
          <div className="grid grid-cols-3 gap-2">
            {punctuationGroups.map(({ chars, label }) => (
              <Checkbox
                key={chars}
                label={`${label} ${chars}`}
                value={rules.punctuation.includes(chars)}
                onChange={(checked) =>
                  setRules((prev) => ({
                    ...prev,
                    punctuation: checked
                      ? [...prev.punctuation, chars]
                      : prev.punctuation.filter((p) => p !== chars),
                  }))
                }
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend>同一原文行内的成对符号</legend>
          <Checkbox
            className="flex"
            label="引号内不拆分（“ ”、「 」等）"
            value={rules.keepQuotes}
            onChange={(keepQuotes) => setRules((prev) => ({ ...prev, keepQuotes }))}
          />
          <Checkbox
            className="flex"
            label="括号和书名号内不拆分（（ ）、【 】、《 》等）"
            value={rules.keepBrackets}
            onChange={(keepBrackets) => setRules((prev) => ({ ...prev, keepBrackets }))}
          />
        </fieldset>
        <Switch
          label="将短句合并到上一段"
          value={rules.mergeShort}
          onChange={(mergeShort) => setRules((prev) => ({ ...prev, mergeShort }))}
        />
        {rules.mergeShort && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["shortLimit", "短句最多字数"],
                  ["previousLimit", "上一段最多字数"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col gap-1.5">
                  {label}
                  <InputNumber
                    min={0}
                    integer
                    value={rules[key]}
                    onChange={(value) => setRules((prev) => ({ ...prev, [key]: value }))}
                  />
                </label>
              ))}
            </div>
            <p className="text-xs text-content-400">标点和空白不计入字数。仅合并相同角色的文本。</p>
            <Checkbox
              label="允许跨原文换行合并"
              value={rules.acrossLines}
              onChange={(acrossLines) => setRules((prev) => ({ ...prev, acrossLines }))}
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}
