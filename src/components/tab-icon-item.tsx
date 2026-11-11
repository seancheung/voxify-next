export default function TabIconItem({
  icon: Icon,
  title,
}: {
  icon: React.ElementType;
  title: string;
}) {
  return (
    <div className="flex items-center justify-center gap-1 has-icon">
      <Icon />
      <span>{title}</span>
    </div>
  );
}
