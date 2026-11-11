import {
  autoUpdate,
  FloatingFocusManager,
  FloatingNode,
  FloatingPortal,
  FloatingTree,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFloatingNodeId,
  useFloatingTree,
  useInteractions,
  useListNavigation,
  useRole,
  useTransitionStyles,
} from "@floating-ui/react";
import { Slot } from "@radix-ui/react-slot";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { type MenuItem, MenuItems, menuPanelClass, menuPanelCompactClass } from "./menu";

export type ContextMenuItem = MenuItem;

export type ContextMenuProps = {
  items: MenuItem[] | ((event: MouseEvent) => MenuItem[]);
  compact?: boolean;
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
};

export default function ContextMenu(props: ContextMenuProps) {
  return (
    <FloatingTree>
      <ContextMenuInner {...props} />
    </FloatingTree>
  );
}

function ContextMenuInner({
  items,
  compact = false,
  disabled,
  open: controlledOpen,
  onOpenChange,
  children,
  className,
}: ContextMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [resolvedItems, setResolvedItems] = useState<MenuItem[]>([]);
  const positionRef = useRef({ x: 0, y: 0 });

  const nodeId = useFloatingNodeId();
  const tree = useFloatingTree();

  const { refs, floatingStyles, context } = useFloating({
    nodeId,
    open,
    onOpenChange: setOpen,
    placement: "right-start",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset({ mainAxis: 0, crossAxis: 2 }),
      flip({ fallbackPlacements: ["left-start", "right-end", "left-end"] }),
      shift({ padding: 8 }),
    ],
  });

  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });

  const listRef = useRef<Array<HTMLElement | null>>([]);
  const listNav = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
    focusItemOnOpen: false,
  });

  const { getFloatingProps, getItemProps } = useInteractions([dismiss, role, listNav]);

  const closeRef = useRef(() => {
    setOpen(false);
    setActiveIndex(null);
  });
  closeRef.current = () => {
    setOpen(false);
    setActiveIndex(null);
  };

  useEffect(() => {
    if (!tree) return;
    const handler = () => closeRef.current();
    tree.events.on("click", handler);
    return () => {
      tree.events.off("click", handler);
    };
  }, [tree]);

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: { open: 150, close: 100 },
    initial: { opacity: 0, transform: "scale(0.96)" },
    open: { opacity: 1, transform: "scale(1)" },
  });

  function handleContextMenu(event: React.MouseEvent) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const x = event.clientX;
    const y = event.clientY;
    positionRef.current = { x, y };
    refs.setPositionReference({
      getBoundingClientRect() {
        return {
          width: 0,
          height: 0,
          x,
          y,
          top: y,
          right: x,
          bottom: y,
          left: x,
        };
      },
    });
    if (typeof items === "function") {
      setResolvedItems(items(event.nativeEvent));
    } else {
      setResolvedItems(items);
    }
    setActiveIndex(null);
    setOpen(true);
  }

  const itemList = typeof items === "function" ? resolvedItems : items;

  return (
    <>
      <Slot onContextMenu={handleContextMenu}>{children}</Slot>
      <FloatingNode id={nodeId}>
        {isMounted && (
          <FloatingPortal>
            <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
              <div
                ref={refs.setFloating}
                style={floatingStyles}
                className="z-50 origin-top-left outline-none"
                {...getFloatingProps()}
              >
                <div
                  style={transitionStyles}
                  className={cn(menuPanelClass, compact && menuPanelCompactClass, className)}
                >
                  <MenuItems
                    items={itemList}
                    compact={compact}
                    listRef={listRef}
                    getItemProps={getItemProps}
                    activeIndex={activeIndex}
                    setActiveIndex={setActiveIndex}
                    onSelect={(item) => {
                      if (item.disabled) return;
                      item.onSelect?.();
                      tree?.events.emit("click");
                    }}
                  />
                </div>
              </div>
            </FloatingFocusManager>
          </FloatingPortal>
        )}
      </FloatingNode>
    </>
  );
}
