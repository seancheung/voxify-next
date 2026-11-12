import { useState } from "react";
import Button from "@/components/ui/button";
import Checkbox from "@/components/ui/checkbox";
import Dialog from "@/components/ui/dialog";
import InputNumber from "@/components/ui/input-number";
import Switch from "@/components/ui/switch";
import { t } from "@/i18n";
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
      title={t("Quick format rules")}
      description={t("Formatting removes empty and whitespace-only lines.")}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => setRules(defaultRules)}>
            {t("Restore default rules")}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            {t("Cancel")}
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
          <legend className="mb-2">{t("Split after these punctuation marks")}</legend>
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
          <legend>{t("Paired punctuation within a line")}</legend>
          <Checkbox
            className="flex"
            label={t("Keep quoted text together")}
            value={rules.keepQuotes}
            onChange={(keepQuotes) => setRules((prev) => ({ ...prev, keepQuotes }))}
          />
          <Checkbox
            className="flex"
            label={t("Keep text inside brackets and title marks together")}
            value={rules.keepBrackets}
            onChange={(keepBrackets) => setRules((prev) => ({ ...prev, keepBrackets }))}
          />
        </fieldset>
        <Switch
          label={t("Merge short sentences into the preceding segment")}
          value={rules.mergeShort}
          onChange={(mergeShort) => setRules((prev) => ({ ...prev, mergeShort }))}
        />
        {rules.mergeShort && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["shortLimit", t("Maximum short sentence length")],
                  ["previousLimit", t("Maximum preceding segment length")],
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
            <p className="text-xs text-content-400">
              {t(
                "Punctuation and spaces are excluded. Only text from the same character is merged.",
              )}
            </p>
            <Checkbox
              label={t("Allow merging across original line breaks")}
              value={rules.acrossLines}
              onChange={(acrossLines) => setRules((prev) => ({ ...prev, acrossLines }))}
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}
