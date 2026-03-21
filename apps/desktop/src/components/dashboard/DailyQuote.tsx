import { Card } from '../common/Card';

interface DailyQuoteProps {
  quote: {
    text: string;
    author: string;
  };
}

export function DailyQuote({ quote }: DailyQuoteProps) {
  return (
    <Card>
      <blockquote className="border-l-2 border-brand pl-4">
        <p className="italic text-text-primary text-lg leading-relaxed">
          "{quote.text}"
        </p>
        <footer className="text-text-secondary text-sm mt-2 text-right">
          -- {quote.author}
        </footer>
      </blockquote>
    </Card>
  );
}
