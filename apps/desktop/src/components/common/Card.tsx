interface CardProps {
  title?: string;
  className?: string;
  children: React.ReactNode;
}

export function Card({ title, className, children }: CardProps) {
  return (
    <div className={`bg-surface-1 border border-border rounded-lg p-5 ${className ?? ''}`}>
      {title && (
        <h3 className="text-brand font-semibold mb-3">{title}</h3>
      )}
      {children}
    </div>
  );
}
