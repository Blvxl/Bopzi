# Bopzi

**Free Roblox market research, at [bopzi.dev](https://bopzi.dev).**

Bopzi collects its own player numbers from Roblox's public endpoints, keeps the history, scores what is really trending, and lets an AI analyst explain it. It does not use RoTerminal or any other analytics provider.

> The site is being rebuilt from scratch. The earlier thumbnail studio is kept in git as the tag `legacy-thumbnail-studio`.

## Plan

1. **Collector and database:** scheduled snapshots of the top games (players, visits, favorites, genre, last update).
2. **Pulse and game pages:** rising games, charts and player history.
3. **Trends:** genres, compare and watchlist.
4. **Ask Bopzi:** an AI analyst that answers only from the stored numbers and cites them.
5. **Daily brief and alerts.**

The trend scores are plain code; the AI only explains them.

## Collector

`npm run collect` does one collection run: it reads Roblox's four public lists (top playing now, top trending, up-and-coming, top revisited), looks up every game on them plus any seen in the last 7 days, and saves a snapshot. With no database settings it writes to `data/bopzi.sqlite`. With `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set it writes to Supabase; create the tables first by running [db/schema.sql](db/schema.sql) in the Supabase SQL editor.

## Development

Needs [Node.js](https://nodejs.org) 20.9 or newer and authorized repository access.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Settings are listed in [.env.example](.env.example).

## License

Proprietary. See [LICENSE](LICENSE). Earlier copies published under MIT remain subject to the MIT terms that accompanied them.

Bopzi is independent and is not affiliated with, endorsed by or sponsored by Roblox Corporation. Roblox is a trademark of its owner.
