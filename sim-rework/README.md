# Rework sim

Bots play the draft rework in `rules-rework.md` (masks, duels, souls as power). It has its own rules engine (`engine.js`), which the web version in `rework-play/` also runs. When a rework rule changes, change `rules-rework.md` first, then `engine.js`.

    npm run sim -- --games 2000 --players mix --bots mix
    npm run sim -- --trace 3 --games 4      # print the action log of game 3

- `--players` 3-6 or `mix`; `--bots` `mix` or a comma list (aggressor, balanced, turtle, random)
- `--arrogation keep|give`: a free player who draws Arrogation keeps it (ruling) or must give it to a slave (discard if none; a true Earl may keep it)
- `--remask flat|half|half6`: remask price: 6 souls (rules), half your souls rounded up, or the larger of the two
- `--market value|flat`: token trades priced by what the token is worth to each side (default; includes buying back your own tokens while masked), or the old flat 3 souls from a player holding no more of that colour
- `--mask-lock on|off`: a mask lost in a duel can't be replaced until the end of your next turn
- `--slave-tokens toss|none-master|none-bag|master|keep` (default none-bag, rules since 2026-11-15): `toss` a slave never holds their master's tokens (they go to the bag) but keeps others; `none-master` / `none-bag` a slave holds no tokens at all (on enslavement the master's go to the bag and the rest to the master / the bag; any they would gain go to the bag); `master` passes the rest to the master once but lets slaves gain tokens later; `keep` is the old rule
- `--rebel-swap on|off` (default on, rules since 2026-11-15): a slave who wins a rebellion swaps places with the master
- `--slave-discard on|off` (default on, rules since 2026-11-15): a slave's tokens leave the game when they are enslaved (holders discard them; bag copies are discarded when drawn, with a refund)
- `--buy3 on|off` (default on, rules since 2026-11-15): pay 6 souls to draw 3 tokens and keep 1; counts as 1 of your 2 buys
- `--marquis-lv1 remask3|keep` (default remask3, rules since 2026-11-15): after losing the Marquis mask in a duel the next remask costs 3; `keep` is the old pay-3-to-stay-masked
- `--remask-end flat|quarter|quarter-rich` (default flat): once Noblesse Oblige ends (2 free players), remasking costs 25% of your souls, or 25% of the richest free player's souls (at least 6)
- `--end-unmask on|off` (default on, rules since 2026-11-15): once Noblesse Oblige ends (2 free players), both are unmasked and can't remask while it lasts
- `--noblesse-end on|off` (default on, rules): Noblesse Oblige ends when only 2 free players remain
- `--card-market on|off` (default off): bots trade event cards (Seize pairs, Arrogation to slaves); the rules do not say cards can be traded
- `--own-redraw on|off` (default off): drawing your own token while unmasked does not use up the draw
- `--noblesse-strict on|off` (default off): Noblesse Oblige without the token exceptions (3+ tokens, actively trading)
- `--duel-take on|off` (default off): an unmasked duel loser gives the chosen token to the victor instead of the bag
- `--order duel-first|buy-first` (default duel-first): bot turn order; duel first so a token knocked into the bag can be drawn the same turn
- `--fate rebel|enslave|threat` (default rebel): bots enslave unless the slave could rebel (rebellion odds ≥ 0.1 turtle, 0.2 balanced, 0.3 aggressor, x1.5 if they hold Arrogation), always enslave, or consume anyone holding their tokens (old bots)
- `--reincarnate-wait N` (default 1, rules since 2026-11-15): a consumed player skips N turns before reincarnating
- `--seed`, `--max-rounds` (default 60; a game still going is a stalemate)

Bot types (`bots.js`): aggressor names at a 1-in-3 chance and duels at even odds; balanced names at 1-in-2; turtle stays masked, names only when certain and never reveals; random is legal but aimless. All bots back the weaker side against the richest player, take long-shot duels against a masked target when a remask is cheap for them, and buy cards with souls above a reserve.

Bots only know what their player could know: public token counts by colour, masks and reveals, and their own Archduke answers. Held tokens stay face down until a naming attempt, so bots judge a naming by the exact chance of success given how many of the target's tokens they hold and which roles still fit.

Modeled simply or not at all: Pacts (in the deck, never played), card trades, haggling, table talk. Token trades (value market): a buyer bids the gain in its naming chance times a prize (aggressor 40, balanced 35, turtle 25 souls), more if the token makes it the top holder; a masked player bids to buy back its own tokens by how much that cuts the holder's naming chance; the seller asks what the token is worth to it, never sells its own colour, and they meet halfway. Up to 3 trades per turn. The Earl's trade bonus is capped at once per turn. Every turn checks that souls never go negative and no colour has more than 4 live tokens.
