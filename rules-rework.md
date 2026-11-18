# Court — Rework draft

A draft of the reworked rules (masks, duels, souls as power). Not yet played. The original rules (`rules.md`) were removed from the repo on 2026-11-17; they are in git history and in a local backup.

## Win condition

Enslave everyone and reach 30 souls.

## Setup

Each player secretly picks a combination of 4 name tokens in their color, each with 1 to 4 dots (dots can repeat), and writes it on a slip. This is their real name; their role is the sum of the dots mod 5 (0 Archduke, 1 Duke, 2 Prince, 3 Marquis, 4 Earl). Each player also selects a mask, a "fake name," from the masks their role allows; players may wear the same mask. The 4 name tokens are all tossed into a cloth bag. There is also 1 blank token within the bag for each player.

Everyone starts with 2 souls.

## Souls

Each player gains 3 souls per turn. Souls are both currency and a measure of power. "Per round" below means once on each of your turns.

## Masks

While a player's mask is up, no one may attempt to name them. You also may only attempt to name someone if you are unmasked.

There are 5 masks, one for each role. Each mask covers 3 roles: its own role and the two next to it on the circle.

Archduke → Duke → Prince → Marquis → Earl → (back to Archduke)

| Your real role | Masks you can wear |
|---|---|
| Archduke | Earl, Archduke, Duke |
| Duke | Archduke, Duke, Prince |
| Prince | Duke, Prince, Marquis |
| Marquis | Prince, Marquis, Earl |
| Earl | Marquis, Earl, Archduke |

A mask gives a weaker version of its role's power (Lv. 1). Unmasking unlocks a stronger version of your mask's power (Lv. 2). When you are unmasked, you may use your true role's third and final upgrade (Lv. 3), at the cost of revealing your true role. The levels do not stack: you have only the power of the level you are at. Revealing is permanent: from then on, Lv. 3 replaces Lv. 2, so whenever you are unmasked you have Lv. 3 and never Lv. 2 again. If you remask, you have your mask's Lv. 1 while masked, and Lv. 3 again when the mask comes down. A new name (reincarnation or rebellion) starts over unrevealed.

A mask comes down in two ways: by losing a duel, or by lowering it voluntarily on your turn, which gains you 4 souls. If you unmask voluntarily, you also return all of the tokens of your own color that you hold to the bag, and gain 3 souls for every token you return. Remasking costs 6 souls, on your turn. Each time you remask, you may choose a new mask.

While unmasked, you may not collect your own tokens (you may keep the ones you hold if you were unmasked unwillingly). If you draw one of your own tokens, put it back and get your 2 souls back.

## Name tokens

Each round, a player may buy up to 2 name tokens, at 2 souls each, drawn at random from the bag. Instead of a single draw, you may pay 6 souls to draw 3 tokens and keep 1 (choose by color; the dots stay hidden), putting the other 2 back; this counts as 1 of your 2 buys. If none of the 3 can be kept, get your 6 souls back. Their color shows on the back; they are kept face down until a naming attempt.

The bag also holds 1 blank token for each player. Blanks have no color. If you draw a blank, put it back and get your 2 souls back, but that draw is used up.

## Trading

On your turn, you may trade souls, name tokens and event cards with any player, in any mix, or give any of them away. Name tokens and event cards pass face down. The other player must agree to the trade. There is no limit on trades per turn. The usual limits still apply: a slave can't hand over their master's tokens, and you can't take your own tokens while unmasked.

## Duels

**Who you can duel (Noblesse Oblige).** You may start a duel only with someone who has more souls than you, is within 2 souls of you, someone of whom you possess 3 or more tokens, or someone who is actively trading your tokens: since your last turn they gained one of your tokens by trading or Seize. Only souls count here, not role bonuses or Collect cards. Noblesse Oblige ends when only 2 free players remain: from then on, either may duel the other, both are unmasked (no souls are gained and no tokens returned), and neither may remask. You may only duel once per turn. You can't start a duel (Arrogation included) if you received souls in a trade since the end of your last turn.

**Strength.** Your strength is your souls, plus any backing on your side and any role bonuses. Your own souls are counted, not spent. A slave's strength is their own souls, not their master's. Collect cards can only be traded in on your turn, not during a duel.

**Backing.** Before the roll, other players may back either side by committing souls. Each side's total backing can't be more than half the defender's souls. Backing adds to that side's strength. The losing side's backing goes to the winner.

**The roll.** Divide the weaker side's strength by the stronger side's and round to the nearest 5%. The stronger side rolls a d20 and wins on the range shown.

| Weaker ÷ stronger | Stronger wins on | Stronger wins | Weaker wins |
|---|---|---|---|
| 100% | 11–20 | 50% | 50% |
| 95% | 10–20 | 55% | 45% |
| 90% | 9–20 | 60% | 40% |
| 85% | 9–20 | 60% | 40% |
| 80% | 8–20 | 65% | 35% |
| 75% | 7–20 | 70% | 30% |
| 70% | 6–20 | 75% | 25% |
| 65% | 5–20 | 80% | 20% |
| 60% | 5–20 | 80% | 20% |
| 55% | 4–20 | 85% | 15% |
| 50% | 3–20 | 90% | 10% |
| 45% | 3–20 | 90% | 10% |
| 40% | 2–20 | 95% | 5% |
| 35% | 2–20 | 95% | 5% |
| 30% | 2–20 | 95% | 5% |
| 25% | 1–20 | 100% | 0% |
| 20% | 1–20 | 100% | 0% |
| 15% | 1–20 | 100% | 0% |
| 10% | 1–20 | 100% | 0% |
| 5% | 1–20 | 100% | 0% |

Example: 9 against 13. 9 ÷ 13 ≈ 70%, so the 13-strength side wins on 6–20.

**Losing a duel.** If you lose a duel while masked, you lose your mask. If you lose a duel with no mask, you put a token of the victor's choice back into the bag. A slave can't lose their mask; they put a token of the victor's choice back into the bag instead.

## Naming

You may try to name a player if you hold at least 1 of their tokens and no other player holds more of them (the target's own tokens don't count; ties allow everyone tied). If no other player holds any of their tokens, anyone may try.

Upon deciding to name someone, you may look at all your tokens of their color. You must go through with the attempt after seeing the tokens. If you fail, they either consume or enslave you (their choice). If you succeed, they are consumed or enslaved (your choice).

## Enslaving

An enslaved player keeps playing but pays 1 soul to their master every round. They cannot take action against their master without Arrogation. While enslaved, they wear a mask of their choice for free and cannot lower it or lose it; a slave who loses a duel puts a token of the victor's choice back into the bag instead. A slave can't name anyone, except their master through Arrogation. Tokens of a slave's color leave the game, as for a consumed player: anyone holding them discards them, and any drawn from the bag are discarded (the draw is used up and the 2 souls refunded). A slave may hold, buy and trade name tokens, but never their master's: when you are enslaved, put all the tokens of your master's color you hold back into the bag, and any you would gain later go into the bag instead (if you drew it, get your 2 souls back). A master may pay their slave 2 souls to take one token of the master's choice from them (by color, face down); the slave must sell. This counts as one of the master's 2 token buys that round. Slaves can't have slaves: when someone with slaves is enslaved, their slaves transfer to the new master. A master may consume their slave on any of their turns without naming them.

## Consuming

Consuming takes someone completely out of the game. You take half their souls (rounded down) and all their event cards. The name tokens they held go back into the bag. Their slaves transfer to you.

Tokens of the consumed player's color leave the game: anyone holding them discards them, and any drawn from the bag are discarded (the draw is used up and the 2 souls refunded, like a blank).

A consumed player waits 1 round: they skip their next turn and reincarnate at the start of the turn after, as a new player with a new name, 2 souls and a new mask. Any tokens of their color still in the bag must be part of their new name; they choose the rest, and the missing tokens go into the bag. Players waiting to reincarnate don't count for "enslave everyone."

## Roles and masks

### Knowledge — Archduke

- Lv. 1: Name token buys cost you 1 soul less (1 soul for a draw, 5 for draw 3 keep 1).
- Lv. 2: You may draw 3 tokens, and choose 1 to keep.
- Lv. 3: Ask anyone 1 yes or no question every round.

### Warlord — Duke

- Lv. 1: For purposes of duel probability rolls, you gain a 25% soul bonus.
- Lv. 2: You may duel anyone once per round.
- Lv. 3: You may duel anyone once per round. For every win, they must give you a token of their choice.

### Ruler — Prince

- Lv. 1: When providing support in duels, you don't lose any souls if the player you aided loses.
- Lv. 2: Duel any player you have 3 or more tokens of; if they lose, they are vassalized. Vassals provide 1 soul per turn. Vassals may break free through Arrogation, or by buying their own tokens back from the Prince at 10 souls each (the Prince must sell). A vassal is free as soon as the Prince holds fewer than 3 of their tokens.
- Lv. 3: You may not consume. Your slaves pay you 3 souls each round instead of 1; if a slave can't pay it all, the bank pays the rest.

### Defender — Marquis

- Lv. 1: If you lose your Marquis mask in a duel, remasking costs you only 3 souls (instead of 6). You still remask on your own turn, so you are unmasked until then.
- Lv. 2: If anyone challenges you to a duel, gain a 50% soul bonus.
- Lv. 3: You cannot be enslaved. Upon naming, gain 6 souls and the effect of Ward. After Ward expires, you may duel the namer for your life. However, your chances of winning are capped at 50%. If you win, you are reborn. If you lose, you die.

### Economy — Earl

- Lv. 1: Event cards cost 2 souls, and the first trade you make each turn gives you 2 souls from the bank. A gift (one side hands over nothing) doesn't count.
- Lv. 2: You may draw 2 cards and keep 1. Put the other back into the deck.
- Lv. 3: Take 1 free event card every turn.

## Event cards

Each costs 3 souls.

- **Seize** (4 copies): Needs 2 copies to use. Take 1 token from anyone.
- **Collect** (6 copies): Trade in for 3 souls.
- **Restoration** (2 copies): Choose one player to put one of your tokens back into the bag.
- **Ward** (2 copies): Delay your enslavement/consumption until after your next turn.
- **Pact** (2 copies): Write a deal with another player, or with yourself, and propose it. A deal with another player takes effect once they accept it. A deal with yourself takes effect once every other player approves it, and its terms must also say who will receive your souls, your event cards, your name tokens and your slaves if you break it (only free players can receive). If anyone rejects it, the Pact card goes back to your hand. A Pact is kept or broken when every player but one agrees that it was, and never fewer than two players (with two players left, both must agree); for a deal between two players, they must also agree on which of the two broke it. Whoever breaks a deal with another player is enslaved or consumed, as the other party chooses (a revealed Marquis at Lv. 3 can't be enslaved; a Prince at Lv. 3 can't consume). If you break a Pact with yourself, you are consumed (Ward can delay either): your things go where the terms said, and as with any consumption, tokens of your color leave the game. Slaves can't make Pacts or be a party to one, though they still vote on them. When a party is enslaved or consumed, the Pact is void; a Pact card still waiting for approval goes back to the proposer if they are free.
- **Arrogation** (9 copies): A slave may attempt to duel their master. If the slave wins, they gain a new name and swap places with their master: the master becomes their slave, and the master's other slaves transfer to them. If they lose, the master takes half of their souls. If Earl is your true role, for every 2 copies of Arrogation you possess, you may discard them to gain 7 souls.

---

## Rulings (2026-11-15)

Decided for the first playtests and the sim; fold into the sections above when the wording settles.

- After a correct naming, the namer chooses enslave or consume; after a wrong one, the target chooses.
- Vassal buy-back (2026-11-17): replaces buying freedom for 6 souls. A vassal may buy back their own tokens even while unmasked. Losing tokens any other way (Seize, Restoration, a lost duel) also frees the vassal once the Prince holds fewer than 3.
- Vassals (Prince Lv. 2) count toward "enslave everyone", are not permanently masked, and can't act against their Prince.
- A slave freed by Arrogation gets a new name: tokens of their old name leave the game (as for a consumed player) and their 4 new tokens go into the bag.
- End of Noblesse Oblige (2026-11-15): if a third free player appears again (a reincarnation, or a rebellion that frees without a swap), Noblesse Oblige is back and players may remask again.
- Marquis Lv. 3 against Prince Lv. 3 (2026-11-16): if a revealed Marquis guesses a revealed Prince's name wrong, the Marquis is consumed. "Cannot be enslaved" wins; the Prince's "may not consume" only limits choices the Prince is free to make.
- Rebellion swap (2026-11-15): only for slaves. A vassal who wins with Arrogation is just freed. A master who can't be enslaved (a revealed Marquis at Lv. 3) is not swapped; the slave is just freed.
- A free player who draws Arrogation keeps it; it can be traded.
- Income (2026-11-17): 3 souls per turn (was 2).
- No duel after trading for souls (2026-11-18): a player who received souls in a trade can't start a duel or play Arrogation until the end of their turn, so souls can't be bought just before a duel. Forced sales (a vassal's buy-back, a master buying from their slave) don't count. Backing and being challenged are unaffected.
- Trading (2026-11-17): souls, name tokens and event cards can all be traded, in any mix, or given away (see Trading). No limit on trades per turn. Asking for a card the other player doesn't hold counts as a decline, so a trade can't be used to find out what someone holds.
- Ward delays until the end of your next turn. If you capture the claimant meanwhile, the claim ends. One Ward per claim; not usable against your own wrong guess.
- Seize takes a random token of a color you choose, from a player you choose.
- When the deck runs out, shuffle the discards into a new deck. No limit on card buys per turn.
- Revealing (2026-11-17): permanent for that name; Lv. 3 replaces Lv. 2 (see Masks).
- Archduke Lv. 2's draw doesn't count toward the 2-per-round token limit, and costs 2 souls.
- Archduke Lv. 1 (2026-11-17): a 1-soul discount on token buys, replacing a free token every turn (it was the strongest ability at the weakest tier; the sim showed no change in win rates).
- Marquis Lv. 3: the final duel uses the table result or 50%, whichever is lower.
- Prince Lv. 3: you choose which of your slave's tokens to buy, face down by color; the slave must sell.

- Pact (2026-11-17): taken from the original rules, with bind/devour/thrall read as enslave/consume/slave. Pacts are still left out of the sim and the web version.
- Archduke Lv. 3 (2026-11-17): any question that can be answered yes or no. (The sim and the web version only ask "is your role X?" or "is your name X?".)
- Earl Lv. 1 (2026-11-17): the trade bonus counts once per turn, and only for a real trade where both sides hand something over (not a gift), so it can't be farmed by passing souls back and forth or giving away 1 soul.

## Known balance issues (abilities not yet changed)

- Earl Lv. 1: cards at 2 souls plus Collect paying 3 makes 1 soul per Collect, every time the deck reshuffles.
- Archduke Lv. 3: a question every round can find any name in about 6 questions.
- Prince Lv. 3 (changed 2026-11-16 to 3 souls of tribute per slave): watch whether it speeds up runaway wealth, since tribute is the main way the leader pulls ahead.
- Duke Lv. 3: barely stronger than Lv. 2; the loser picks the token they give.
- Arrogation: 9 of 25 cards, dead for anyone who isn't a slave.
- Marquis: defensive at every tier; watch for turtling.
