/**
 * Daily Quote Rotation
 *
 * Curated "operator" quotes on discipline, execution, hustle,
 * accountability, and focus. Rotates daily based on day-of-year.
 */

interface Quote {
  text: string;
  author: string;
}

const QUOTES: Quote[] = [
  { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "You don't rise to the level of your goals. You fall to the level of your systems.", author: "James Clear" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "Suffer the pain of discipline or suffer the pain of regret.", author: "Jim Rohn" },
  { text: "We don't rise to the level of our expectations, we fall to the level of our training.", author: "Archilochus" },
  { text: "The impediment to action advances action. What stands in the way becomes the way.", author: "Marcus Aurelius" },
  { text: "It is not that we have a short time to live, but that we waste a good deal of it.", author: "Seneca" },
  { text: "You could leave life right now. Let that determine what you do and say and think.", author: "Marcus Aurelius" },
  { text: "Be tolerant with others and strict with yourself.", author: "Marcus Aurelius" },
  { text: "We suffer more in imagination than in reality.", author: "Seneca" },
  { text: "Who you are is defined by what you're willing to struggle for.", author: "David Goggins" },
  { text: "Don't stop when you're tired. Stop when you're done.", author: "David Goggins" },
  { text: "You are in danger of living a life so comfortable and soft that you will die without ever realizing your potential.", author: "David Goggins" },
  { text: "Discipline equals freedom.", author: "Jocko Willink" },
  { text: "Don't expect to be motivated every day to get out there and make things happen. You won't be. Don't count on motivation. Count on discipline.", author: "Jocko Willink" },
  { text: "The more you sweat in training, the less you bleed in combat.", author: "Richard Marcinko" },
  { text: "Rest at the end, not in the middle.", author: "Kobe Bryant" },
  { text: "Everything negative -- pressure, challenges -- is all an opportunity for me to rise.", author: "Kobe Bryant" },
  { text: "I can't relate to lazy people. We don't speak the same language.", author: "Kobe Bryant" },
  { text: "If you want to be rich, stop asking for permission.", author: "Naval Ravikant" },
  { text: "Earn with your mind, not your time.", author: "Naval Ravikant" },
  { text: "Play long-term games with long-term people.", author: "Naval Ravikant" },
  { text: "99% of all effort is wasted. Spend more time deciding what to work on.", author: "Alex Hormozi" },
  { text: "Volume negates luck.", author: "Alex Hormozi" },
  { text: "Most people overestimate what they can do in a day and underestimate what they can do in a year.", author: "Alex Hormozi" },
  { text: "Without hustle, talent will only carry you so far.", author: "Gary Vaynerchuk" },
  { text: "Stop whining, start hustling.", author: "Gary Vaynerchuk" },
  { text: "Skills are cheap. Passion is priceless.", author: "Gary Vaynerchuk" },
  { text: "Work like there is someone working 24 hours a day to take it all away from you.", author: "Mark Cuban" },
  { text: "It doesn't matter how many times you fail. You only have to be right once.", author: "Mark Cuban" },
  { text: "When something is important enough, you do it even if the odds are not in your favor.", author: "Elon Musk" },
  { text: "If you're changing the world, you're working on important things. You're excited to get up in the morning.", author: "Elon Musk" },
  { text: "Your margin is my opportunity.", author: "Jeff Bezos" },
  { text: "I knew that if I failed I wouldn't regret that, but I knew the one thing I might regret is not trying.", author: "Jeff Bezos" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "It is not the strongest of the species that survives, nor the most intelligent, but the one most responsive to change.", author: "Charles Darwin" },
  { text: "The world is changed by your example, not by your opinion.", author: "Paulo Coelho" },
  { text: "Champions keep playing until they get it right.", author: "Billie Jean King" },
  { text: "Obsessed is a word the lazy use to describe the dedicated.", author: "Grant Cardone" },
  { text: "Success is never owned, it is rented. And the rent is due every day.", author: "Rory Vaden" },
  { text: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Amateurs sit and wait for inspiration. The rest of us just get up and go to work.", author: "Stephen King" },
  { text: "What gets measured gets managed.", author: "Peter Drucker" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky" },
  { text: "Stay hungry. Stay foolish.", author: "Steve Jobs" },
];

/**
 * Get the daily rotating quote.
 * Returns the same quote for an entire calendar day (UTC).
 */
export function getDailyQuote(): Quote {
  const now = new Date();
  const startOfYear = new Date(now.getUTCFullYear(), 0, 0);
  const diff = now.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diff / (24 * 60 * 60 * 1000));
  return QUOTES[dayOfYear % QUOTES.length];
}
