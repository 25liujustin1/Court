# Court — Rules

This file is the source of truth. When a rule changes, change it here first, then update `playtest/index.html` to match.

## Components

- Name tokens: 4 per player per color, each marked with 1, 2, 3, or 4 dots, with the player color showing on both sides. Extra tokens (or blank tokens and a dry-erase marker) are needed for Rebirth.
- Event cards, 48 in a face-down deck: Seize 12, Collect 6, Scrying 6, Ward 9, Pact 3, Meta 2, Arrogation 4, Welfare 6.
- Souls (currency).
- A slip of paper per player and an opaque bag.
- The name table (`name-table.tex`).

## Setup

Each player secretly picks a combination of 4 name tokens in their player color. Each token has 1, 2, 3, or 4 dots, and dots can repeat. There are 35 possible combinations, each mapping to a demon name on the name table, 7 for each role. Players may pick the same combination.

Add up the dots in your combination and take the total mod 5. The result (0 to 4) is your role: 0 Archduke, 1 Duke, 2 Prince, 3 Marquis, 4 Earl.

Write your combination on your slip and keep it face down. Reveal it when you are named.

Put all name tokens into the opaque bag. Shuffle the event cards into a face-down deck.

Everyone starts with 2 souls. Roll a die to decide who goes first. Play goes counterclockwise.

## Goal

Win by being the last player standing: every other player has been devoured or is your thrall.

## Name tokens

Keep your name tokens in front of you, dot side down. The number and color of tokens each player holds is always public. When a player is devoured, all of their color's tokens are removed from the game.

## Turns

At the start of each of your turns, you gain 2 souls. If you are a thrall, you instead produce 2 souls, which go immediately to your binder.

There is no limit on how many souls you can spend per turn, or on how many souls or cards you can hold.

On your turn you may make 1 name token purchase:

- Pay 1 soul for a random name token from the bag.
- Pay 3 souls to draw 2 name tokens from the bag without looking at their dots, and keep 1 of your choice by color. Put the other back into the bag unseen.

You may also pay 1 soul for an event card, as many times as you like.

If the event deck runs out, shuffle the used event cards to form a new deck.

## Token rounds

Until the bag is empty for the first time, name tokens can only be bought in odd-numbered rounds (round 1, 3, 5, and so on). The Scrying card follows the same rule. Once the bag has been emptied, name tokens can be bought in any round.

## Naming

At any time, you may try to name a player if you hold at least 1 of their name tokens and no other player holds more of them. The target's own tokens don't count, tokens held by thralls do, and ties allow everyone tied to try. If no other player holds any of their tokens, anyone may try to name them. Before revealing, announce whether you will bind or devour. If you name them correctly, you do it to them. If you're wrong, they choose whether to bind or devour you. Role restrictions still apply: a Prince can only bind, and a Marquis can only devour and cannot be bound. When a Prince names a Marquis correctly or decides a Marquis's fate, the Prince devours them. You may not hint at or tell anyone what is on your name tokens.

**Bind:** the player stays in the game under you. You take all of their event cards and souls and choose 1 of their name tokens. From then on, any souls your thrall gets, from any source, go immediately to you. You can devour your thrall on any of your turns.

**Devour:** the player is out. You take all of their event cards and souls and half of their name tokens, rounded up, which you choose by color, face down, and you gain 4 souls from the bank unless they were your thrall. The rest of their name tokens go back into the bag.

**Giving away taken tokens:** right after you bind or devour someone, before you look at the name tokens you took, you may give any of them away, face down, to players who aren't thralls. No trade fee is paid, since you never saw them.

## Thralls

Thralls take turns but cannot name anyone, except through Arrogation. Thralls cannot be stolen by other players. If a binder is devoured or bound, their thralls transfer to whoever did it.

## Trading

On your turn, you may trade souls, event cards, and name tokens with any other player. For each name token traded, both the giver and the receiver pay 4 souls to the bank. Name tokens are passed face down, so only the two traders know their dots; the table sees only their colors. Event cards are passed face down. Promises about future trades are not binding unless made with a Pact. Thralls can't trade, and nobody can trade with a thrall.

## Roles

- **Archduke:** Compel any player to truthfully answer one yes or no question. Usable once per player. Cannot question other players' thralls.
- **Duke:** While holding an Arrogation card, the Duke can use the Archduke's question on up to half of the other starting players, rounding down, over the whole game.
- **Prince:** Cannot devour, except a Marquis the Prince names correctly or whose fate the Prince decides. Can buy name tokens from their thralls for 2 souls each, paid to the bank.
- **Marquis:** Cannot bind and cannot be bound. Plays normally until devoured. Once named correctly by anyone but a Prince, the Marquis can be devoured at any later time by any player except a Prince who pays 4 souls. The Marquis's spoils, and the 4-soul devour bonus, go to the original namer. If the original namer has been devoured, they go to whoever devoured the namer. If a Prince names the Marquis correctly, or decides the Marquis's fate (for example, the Marquis names the Prince wrongly, or breaks a Pact with the Prince), the Prince devours the Marquis.
- **Earl:** May take 1 free event card on each of their turns.

## Event cards

- **Seize:** Discard 2 Seize cards to steal 1 event card from anyone. Discard 4 to steal a random face-down name token of a color of your choice from anyone.
- **Collect:** Trade in at any time for 2 souls.
- **Scrying:** Choose one: draw 3 name tokens from the bag without looking at their dots, keep 1 by color, and put the others back unseen (this only works in token rounds and counts as your 1 token purchase for that turn); or discard 2 Scrying cards to look at the top 4 event cards. Any card among them that says "when drawn" takes effect immediately and doesn't count toward your choice. Keep 2 of the others and discard the rest.
- **Ward:** When you would be bound or devoured because someone named you correctly, paid to devour you as a marked Marquis, or because you broke a Pact, you may discard 3 Wards. The bind or devour waits until the end of your next turn, and at that point you may discard 3 more Wards to delay it again. While it's waiting, you play normally, but no one else may name you or pay to devour you. If the player claiming you is bound or devoured before it takes effect, the claim passes to whoever did it, and they choose bind or devour, following role restrictions. If you bind or devour that player yourself, by any means, the claim ends; if you had been named, you are also reborn (see Arrogation). A broken Pact with yourself has no claimant: Ward only delays it. You can't use Ward against the result of your own wrong guess, and it doesn't stop a Marquis from being marked.
- **Arrogation:** When you draw it: if you're a Duke, you may keep it (while you hold it, you have the Archduke's question with the Duke's limit). Otherwise, if any thrall could use it, you must show it and give it to a thrall of your choice. Otherwise, put it back into the deck anywhere you choose, or discard it. It can be traded or stolen like any event card, but it only does something when it's drawn or while a Duke holds it: anyone else who ends up with one (by trade, theft, binding, devouring or a broken Pact) just holds it, and it has no effect for them.
  - The thrall who receives it may attempt to name their binder without needing to hold the most of the binder's tokens. If they succeed, they switch roles with their binder, and the binder's other thralls transfer to the new binder. The freed thrall is then reborn: they secretly choose a new name (any combination except their old one), their role becomes whatever the new name gives, and every one of their old name tokens, in players' hands and in the bag, is replaced one for one by a random token of the new name. If the thrall fails, they give all their name tokens to their binder and can never rebel against that binder again. A thrall can use it only against a binder they haven't already failed against.
- **Meta:** When you draw this card, you must immediately verbally/physically assault a player of your choice.
- **Pact:** Seal a deal with any player, or with yourself. Whoever breaks a deal with another player is bound or devoured, as the other party chooses. A Pact with yourself needs the table's agreement. Before it's sealed, you must say who will receive your souls, your event cards, your name tokens and your thralls if you break it. Each can go to one player, or be split as evenly as possible among the other players; only players who aren't thralls can receive. If you break it, you are devoured (Ward can delay this): everything goes where you said, and as with any devour, every token of your color leaves the game.
- **Welfare:** When drawn, reveal it. The player with the lowest net worth who isn't a thrall takes 1 soul from every other player who has souls. If players are tied for lowest, they split the souls. If the souls can't be split evenly, the extra soul goes to the player with the second-lowest net worth. Net worth = souls + event cards + 2 × name tokens.
