import { TableHead, TableRow } from "../ui/table";

export default function VoiceDesignsHeaderRow() {
  return (
    <TableRow>
      <TableHead className="w-1/3">名称</TableHead>
      <TableHead className="w-40">服务</TableHead>
      <TableHead className="w-32">状态</TableHead>
      <TableHead className="w-px">操作</TableHead>
    </TableRow>
  );
}
