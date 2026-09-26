import { useEffect } from 'react';

export function Toast({ text, onDone, duration = 2500 }: { text: string | null; onDone: () => void; duration?: number }) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [text, onDone, duration]);
  if (!text) return null;
  return (
    <div className="toast" role="status" data-testid="toast">
      {text}
    </div>
  );
}
