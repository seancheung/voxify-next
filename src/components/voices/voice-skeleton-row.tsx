import Skeleton from "../ui/skeleton";
import { TableCell, TableRow } from "../ui/table";

export default function VoiceSkeletonRow() {
  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Skeleton className="h-4 w-12 rounded-sm" />
          <Skeleton className="h-4 w-14 rounded-sm" />
        </div>
      </TableCell>
      <TableCell>
        <div className="inline-flex items-center gap-2">
          <Skeleton className="h-6 w-16 rounded-md" />
          <Skeleton className="h-5 w-9 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </TableCell>
    </TableRow>
  );
}
