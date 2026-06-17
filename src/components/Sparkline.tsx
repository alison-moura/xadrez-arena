interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  showDots?: boolean;
  showLabels?: boolean;
}

// SVG sparkline puro. Renderiza no servidor sem JS.
export function Sparkline({
  values,
  width = 280,
  height = 60,
  stroke = "#f5b301",
  fill = "rgba(245,179,1,0.12)",
  showDots = false,
  showLabels = true,
}: SparklineProps) {
  if (values.length < 2) {
    return (
      <div className="text-[10px] text-muted">Dados insuficientes pra plotar.</div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 4;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = innerW / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + innerH - ((v - min) / range) * innerH;
    return { x, y, v };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${path} L${(pad + innerW).toFixed(1)},${(pad + innerH).toFixed(1)} L${pad.toFixed(1)},${(pad + innerH).toFixed(1)} Z`;
  const last = values[values.length - 1];
  const first = values[0];
  const diff = last - first;
  const trendColor = diff > 0 ? "text-success" : diff < 0 ? "text-danger" : "text-muted";

  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        <path d={areaPath} fill={fill} />
        <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
        {showDots && points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={1.5} fill={stroke} />
        ))}
        {/* destaque no último ponto */}
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={2.5} fill={stroke} />
      </svg>
      {showLabels && (
        <div className="flex items-baseline justify-between text-[10px] text-muted">
          <span>{first} → {last}</span>
          <span className={trendColor}>
            {diff > 0 ? "+" : ""}{diff} ({values.length} partidas)
          </span>
          <span>mín {min} · máx {max}</span>
        </div>
      )}
    </div>
  );
}
