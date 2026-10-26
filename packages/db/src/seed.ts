import "dotenv/config";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const sql = postgres(connectionString);
const questions = [
  { id: "values-1", category: "values", kind: "single", prompt: "What makes a relationship feel secure?", choices: ["Consistency", "Honesty", "Independence", "Affection"], weight: "1.25" },
  { id: "values-2", category: "values", kind: "single", prompt: "When plans change, what matters most?", choices: ["Clear communication", "Flexibility", "A thoughtful apology", "Finding a new plan"], weight: "1.0" },
  { id: "values-3", category: "values", kind: "single", prompt: "What is worth protecting in a busy life?", choices: ["Time together", "Personal space", "Family ties", "Curiosity"], weight: "1.0" },
  { id: "values-4", category: "values", kind: "single", prompt: "How do you prefer to work through a disagreement?", choices: ["Talk it through soon", "Take a little time first", "Write down what I mean", "Find common ground together"], weight: "1.0" },
  { id: "lifestyle-1", category: "lifestyle", kind: "single", prompt: "Your ideal weekend pace?", choices: ["Slow and restful", "A little of both", "Full of plans", "Spontaneous"], weight: "1.0" },
  { id: "lifestyle-2", category: "lifestyle", kind: "single", prompt: "How social is your usual week?", choices: ["Mostly quiet", "A few plans", "Often with people", "It changes each week"], weight: "1.0" },
  { id: "lifestyle-3", category: "lifestyle", kind: "single", prompt: "Which feels more like home?", choices: ["A calm evening in", "Dinner with friends", "A new place to explore", "Somewhere outdoors"], weight: "1.0" },
  { id: "intent-1", category: "intent", kind: "single", prompt: "What are you open to building?", choices: ["A long-term partnership", "A meaningful connection, with room to grow", "A lighter connection", "I'm still finding the words"], weight: "1.0" },
  { id: "intent-2", category: "intent", kind: "single", prompt: "How quickly do you like a connection to develop?", choices: ["Slowly and thoughtfully", "Naturally, without a timeline", "I like clear momentum", "It depends on the person"], weight: "1.0" },
  { id: "tradeoff-1", category: "tradeoffs", kind: "tradeoff", prompt: "Choose one for an open Saturday.", choices: ["A quiet bookshop afternoon", "A last-minute day trip"], weight: "1.0" },
  { id: "tradeoff-2", category: "tradeoffs", kind: "tradeoff", prompt: "Choose one evening.", choices: ["Cook together at home", "Try a new restaurant"], weight: "1.0" },
  { id: "tradeoff-3", category: "tradeoffs", kind: "tradeoff", prompt: "Choose one kind of conversation.", choices: ["One big question, explored deeply", "Many small stories, moving freely"], weight: "1.0" }
];

try {
  await sql`
    insert into zones (city, name, country)
    values ('Lagos', 'Lagos Mainland', 'Nigeria'), ('Lagos', 'Lagos Island', 'Nigeria')
    on conflict (city, name, country) do nothing
  `;
  for (const question of questions) {
    await sql`
      insert into questions (id, version, kind, category, weight, options)
      values (
        ${question.id},
        1,
        ${question.kind},
        ${question.category},
        ${question.weight},
        ${sql.json({ prompt: question.prompt, choices: question.choices })}
      )
      on conflict (id, version) do nothing
    `;
  }
} finally {
  await sql.end();
}

