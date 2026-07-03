import { useEffect, useRef } from 'react';

// Rising-embers canvas field. Cheap (a few hundred particles, no WebGL) but it
// is the single biggest driver of "does this feel alive" for the hero section
// -- on-theme for a forge/kiln product rather than a generic gradient blob.
export default function EmberField({ density = 70, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    let particles = [];
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn() {
      const hue = 18 + Math.random() * 24; // amber/orange range
      return {
        x: Math.random() * width,
        y: height + Math.random() * height * 0.4,
        r: 0.6 + Math.random() * 2.2,
        speed: 0.25 + Math.random() * 0.7,
        drift: (Math.random() - 0.5) * 0.4,
        life: 0,
        maxLife: 400 + Math.random() * 500,
        hue,
        flicker: Math.random() * Math.PI * 2,
      };
    }

    function init() {
      resize();
      particles = Array.from({ length: density }, () => ({ ...spawn(), y: Math.random() * height }));
    }

    function tick() {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.y -= p.speed;
        p.x += p.drift + Math.sin(p.flicker + p.life * 0.05) * 0.15;
        p.life += 1;
        const lifePct = p.life / p.maxLife;
        const fade = lifePct < 0.1 ? lifePct / 0.1 : 1 - (lifePct - 0.1) / 0.9;
        const alpha = Math.max(0, fade) * 0.85;

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        grad.addColorStop(0, `hsla(${p.hue}, 100%, 65%, ${alpha})`);
        grad.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${p.hue}, 100%, 75%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        if (p.life >= p.maxLife || p.y < -20) Object.assign(p, spawn());
      }
      raf = requestAnimationFrame(tick);
    }

    init();
    tick();
    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [density]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
