import { useState } from 'react';
import { inputClass } from './ui';

export function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (items: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft('');
  };
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm">
            {item}
            <button type="button" onClick={() => onChange(items.filter((i) => i !== item))} className="text-slate-400 hover:text-red-600" aria-label={`Remover ${item}`}>×</button>
          </span>
        ))}
      </div>
      <input
        className={inputClass}
        value={draft}
        placeholder="Adicionar e apertar Enter"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add}
      />
    </div>
  );
}
