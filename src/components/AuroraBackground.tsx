const AuroraBackground = () => (
  <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
    <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-primary/30 blur-[120px] animate-float-orb" />
    <div className="absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full bg-secondary/25 blur-[140px] animate-float-orb" style={{ animationDelay: "3s" }} />
    <div className="absolute -bottom-40 left-1/3 h-[500px] w-[500px] rounded-full bg-fuchsia-500/20 blur-[120px] animate-float-orb" style={{ animationDelay: "6s" }} />
    <div className="absolute inset-0 bg-[linear-gradient(hsl(var(--border)/0.15)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--border)/0.15)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
  </div>
);

export default AuroraBackground;