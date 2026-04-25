"use client";

import { useEffect, useRef } from "react";

function ParticleCanvas({ on }: { on: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    type Particle = { x: number; y: number; vx: number; vy: number; r: number; o: number; twinkle: number };
    let particles: Particle[] = [];

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const N = Math.min(80, Math.floor((w * h) / 18000));
      particles = Array.from({ length: N }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
        r: 0.6 + Math.random() * 1.4,
        o: 0.15 + Math.random() * 0.4,
        twinkle: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    const isDark = () => document.documentElement.dataset.theme === "dark";

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      const dark = isDark();
      const stroke = dark ? "rgba(0,179,255,0.18)" : "rgba(0,128,200,0.12)";
      const fillBase = dark ? "255,255,255" : "20,60,120";

      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.4;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 14000) {
            ctx.globalAlpha = (1 - d2 / 14000) * 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      for (const p of particles) {
        if (on) {
          p.x += p.vx;
          p.y += p.vy;
          p.twinkle += 0.012;
          if (p.x < -10) p.x = w + 10;
          if (p.x > w + 10) p.x = -10;
          if (p.y < -10) p.y = h + 10;
          if (p.y > h + 10) p.y = -10;
        }
        const tw = 0.6 + 0.4 * Math.sin(p.twinkle);
        ctx.fillStyle = `rgba(${fillBase},${p.o * tw})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [on]);

  return <canvas ref={ref} className="bg-particles" />;
}

interface BackgroundStageProps {
  animOn?: boolean;
  fixed?: boolean;
}

export function BackgroundStage({ animOn = true, fixed = true }: BackgroundStageProps) {
  return (
    <div className={`bg-stage${fixed ? " bg-fixed" : ""}${animOn ? "" : " bg-anim-off"}`}>
      <div className="bg-orb o1" />
      <div className="bg-orb o2" />
      <div className="bg-orb o3" />
      <ParticleCanvas on={animOn} />
      <div className="bg-noise" />
    </div>
  );
}
