# Simulation

Strategy bots play thousands of games on the real rules code: `page.js` loads the script from `playtest/index.html` into a Node vm, so the sim can't drift from the playtest page. Bots answer the page's prompts instead of clicking.

    npm run sim -- --games 3000 --players mix --bots mix:aggressor,turtle,hoarder

- `--players` 3-6, or `mix` (random per game)
- `--bots` `mix` (all types), `mix:a,b` (random from a list), one type for every seat, or a comma list per seat
- `--trade on|off` (default on): bots buy single tokens from each other for souls, either to gather a target's tokens until they can name them or (turtles) to pull their own tokens back. Buyers work out the seller's asking price from public token counts and save souls for a deal they can't afford yet. 
- `--card-trade on|off` (default on): bots buy Seize cards to complete a set of 4 in one turn (saving souls if needed). Sellers ask 1 + the Seize cards they hold, per card, and won't sell from a hand of 3. Card hands are hidden, so this stands in for asking the table who will sell. No other card types are traded.
- `--arch eager|patient`: when Archduke (and Arrogation Duke) bots ask. Eager (default) asks as soon as anyone is askable; patient asks only when the answer lets it name that player next turn
- `--tokens 4 --dots 4 --thefts 12`: name tokens per player, max dots per token, Seize cards in the deck (defaults are the current rules). The page reads these from `globalThis.MADK_CONFIG`; bigger name tables take extra Goetia names from `EXTRA_NAMES` in the page.
- `--fakes N --fake-elig public|real`: N blank (fake) tokens per color go into the bag (rules: 4). `public`: blanks count toward naming eligibility like any token; `real`: only real tokens count. Bots ignore blanks when narrowing names but never bluff with them or sell them on purpose.
- `--reveal always|smart` (default always): smart aggressors and hoarders only use a role ability if, once their role is public, the rival holding the most of their tokens would still face at least 2 (aggressor) or 3 (hoarder) possible names.
- `--seed`, `--max-rounds` (default 60; a game still going is a stalemate), `--json` for raw per-game records

## Replays

    npm run replay -- --seed 3
    npm run replay -- --seed 3 --games 20 --dots 4 --thefts 12

Writes `sim/replays/replay.html` (git-ignored): a step-through viewer of every action in each game, built from `replay-template.html`. It shows everything, including secret names, each player's cards and token dots, and for every bot how many names are still possible for each opponent (red = certain, bold = allowed to name). Use a few games at a time; each game is a full snapshot per action. The same `--seed` and options always replay the same games.

Bot types (`bots.js`):

- aggressor: names at 3 or fewer candidate names, devours, uses abilities, devours any marked Marquis
- turtle: collects its own tokens, never reveals its role, names only when certain
- hoarder: buys many cards, keeps Arrogation from the Duke, names only when certain
- random: legal but aimless; names blindly 30% of the time

Bots only know what their player could know: dots on tokens they hold or have held, public role reveals, and their own Archduke answers (modeled as "is your name one of these?" over half the remaining candidates).

Not modeled: card trades, haggling, Pacts, naming out of turn, bluffing, table talk. Use real playtests for the social side.

Each game also checks the invariants from the browser tests (every event card accounted for, 4 tokens in play per living player, no negative souls).
