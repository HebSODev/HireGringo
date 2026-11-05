import { useState } from 'react';

const STAR_PATH = 'M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96L12 2.5z';

export function formatRating(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: value % 1 ? 1 : 0 });
}

function Star({ fill }: { fill: 0 | 0.5 | 1 }) {
  return (
    <span className="relative block h-9 w-9">
      <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full text-slate-300" fill="currentColor" aria-hidden="true">
        <path d={STAR_PATH} />
      </svg>
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
        <svg viewBox="0 0 24 24" className="h-9 w-9 text-amber-400" fill="currentColor" aria-hidden="true">
          <path d={STAR_PATH} />
        </svg>
      </span>
    </span>
  );
}

/** Nota de 0,5 a 5 em meias estrelas: a metade esquerda de cada estrela vale meio ponto. */
export function StarRating({ value, onChange, disabled }: { value: number; onChange(v: number): void; disabled?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;

  return (
    <div className="flex items-center gap-3">
      <div className="flex" role="group" aria-label="Sua nota" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = shown >= star ? 1 : shown >= star - 0.5 ? 0.5 : 0;
          return (
            <span key={star} className="relative">
              <Star fill={fill} />
              {[star - 0.5, star].map((v, half) => (
                <button
                  key={v}
                  type="button"
                  disabled={disabled}
                  aria-label={`${formatRating(v)} ${v === 1 ? 'estrela' : 'estrelas'}`}
                  aria-pressed={value === v}
                  onMouseEnter={() => setHover(v)}
                  onFocus={() => setHover(v)}
                  onBlur={() => setHover(null)}
                  onClick={() => onChange(v)}
                  className={`absolute inset-y-0 w-1/2 cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed ${half ? 'right-0' : 'left-0'}`}
                />
              ))}
            </span>
          );
        })}
      </div>
      <span className="w-8 text-sm font-semibold tabular-nums text-slate-700">{shown ? formatRating(shown) : ''}</span>
    </div>
  );
}
