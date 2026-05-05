import { useEffect, useRef, useState, ReactNode } from "react";

interface Props {
  initial: { x: number; y: number };
  width: number;
  zIndex?: number;
  children: (handle: { onMouseDown: (e: React.MouseEvent) => void }) => ReactNode;
}

export default function Draggable({ initial, width, zIndex = 100, children }: Props) {
  const [pos, setPos] = useState(initial);
  const dragRef = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { ox, oy, sx, sy } = dragRef.current;
      setPos({ x: ox + (e.clientX - sx), y: oy + (e.clientY - sy) });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { ox: pos.x, oy: pos.y, sx: e.clientX, sy: e.clientY };
  };

  return (
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        width,
        zIndex,
      }}
    >
      {children({ onMouseDown })}
    </div>
  );
}