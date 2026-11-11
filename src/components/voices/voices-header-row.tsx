import { TableHead, TableRow } from "../ui/table";

export default function VoicesHeaderRow() {
  return (
    <TableRow>
      <TableHead className="w-1/4">名称</TableHead>
      <TableHead className="w-40">服务</TableHead>
      <TableHead>标签</TableHead>
      <TableHead className="w-px">操作</TableHead>
    </TableRow>
  );
}
