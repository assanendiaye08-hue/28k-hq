interface CardProps {
  title?: string;
  className?: string;
  children: React.ReactNode;
}

export function Card({ title, className, children }: CardProps) {
  return (
    <div className={`bg-surface-1 border border-white/5 rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.3)] ${className ?? ''}`}>
      {title && (
        <h3 className="text-brand font-semibold mb-3">{title}</h3>
      )}
      {children}
    </div>
  );
}
