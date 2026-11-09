import { useState } from 'react';
import { X } from 'lucide-react';
import { useGroupTags } from '@/hooks/queries';
import { inputClass } from '@/components/ui';

const MAX_TAGS = 10;
const MAX_LEN = 30;

function clean(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim().toLowerCase().slice(0, MAX_LEN);
}

/** Campo de tags em chips: Enter ou vírgula adiciona; sugestões vêm das tags já usadas no grupo. */
export function TagInput({ value, onChange, id }: { value: string[]; onChange: (tags: string[]) => void; id?: string }) {
  const [text, setText] = useState('');
  const { data: known = [] } = useGroupTags();

  function add(raw: string) {
    const tag = clean(raw);
    if (tag && !value.includes(tag) && value.length < MAX_TAGS) onChange([...value, tag]);
    setText('');
  }

  const query = clean(text);
  const suggestions = known
    .filter((t) => !value.includes(t.tag) && (!query || t.tag.includes(query)))
    .slice(0, 6);
  const full = value.length >= MAX_TAGS;

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
              #{tag}
              <button
                type="button"
                aria-label={`Remover tag ${tag}`}
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted"
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        className={inputClass}
        value={text}
        maxLength={MAX_LEN + 1}
        disabled={full}
        placeholder={full ? 'Limite de 10 tags' : 'Digite e tecle Enter'}
        onChange={(e) => {
          if (e.target.value.endsWith(',')) add(e.target.value.slice(0, -1));
          else setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          }
        }}
        onBlur={() => text.trim() && add(text)}
      />
      {!full && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((t) => (
            <button
              key={t.tag}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(t.tag)}
              className="min-h-9 rounded-full border border-line px-3 text-xs text-muted"
            >
              #{t.tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
