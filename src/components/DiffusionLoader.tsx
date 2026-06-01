import { useMemo } from "react";

interface Props {
  count?: number;
  label?: string;
}

const DiffusionLoader = ({ count = 60, label = "AI 正在绘制中..." }: Props) => {
  const dots = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const top = Math.random() * 100;
      const left = Math.random() * 100;
      const dx = (Math.random() - 0.5) * 80;
      const dy = (Math.random() - 0.5) * 80;
      const delay = -(Math.random() * 2.8);
      const duration = 2.2 + Math.random() * 1.6;
      const size = 6 + Math.random() * 16;
      return { i, top, left, dx, dy, delay, duration, size };
    });
  }, [count]);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="diffusion-stage">
        {dots.map((d) => (
          <span
            key={d.i}
            className="dot"
            style={{
              top: `${d.top}%`,
              left: `${d.left}%`,
              width: `${d.size}px`,
              height: `${d.size}px`,
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.duration}s`,
              ['--dx' as any]: `${d.dx}px`,
              ['--dy' as any]: `${d.dy}px`,
            }}
          />
        ))}
      </div>
      <div className="relative z-10 flex flex-col items-center gap-3 text-foreground/80">
        <div className="rounded-full bg-background/40 px-4 py-1.5 text-xs font-medium ring-1 ring-border/60 backdrop-blur-md">
          {label}
        </div>
      </div>
    </div>
  );
};

export default DiffusionLoader;