import { PlusIcon } from "lucide-react";
import Button from "../ui/button";

export default function VoicesEmptyState({
  hasFilters,
  onCreate,
}: {
  hasFilters: boolean;
  onCreate: () => void;
}) {
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-content-400">
        <p className="text-sm">没有匹配的声音</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-content-400">
      <p className="text-sm">还没有声音，点击右上角创建</p>
      <Button onClick={onCreate}>
        <PlusIcon />
        新建声音
      </Button>
    </div>
  );
}
