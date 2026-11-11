# Online server

Play Court with each player on their own device.

    npm run server

Then open the printed address: `http://localhost:3000` on this computer, or `http://<this computer's IP>:3000` from phones on the same Wi-Fi (Windows may ask to allow Node through the firewall the first time). One player creates a game and shares the 4-letter code; 3 to 6 players join, everyone chooses their name on their own screen, and the host starts.

How it works:

- Each room runs the playtest page's own rules code (`playtest/index.html`) in a Node vm, the same way the sim does, so there is one copy of the rules.
- The server is the referee. It holds the real game state and sends each player a view with other players' names, card faces, token dots, the bag and the deck removed.
- Every prompt goes to the player who must answer it. Rules functions that act for a specific player (binding, devouring, Ward offers, Arrogation rebellions, trades...) are wrapped with `actingFor` in the page, so their prompts go to that player; everything else goes to whoever acted.
- Players can act out of turn (naming, devouring a marked Marquis) with the Act now button. One action runs at a time.
- Reloading the page rejoins your seat (it's remembered in the browser).

Not yet: games are kept in memory only (restarting the server ends them), and there is no hosting set up. `npm run test:online` drives 3 browsers through a game and checks that no secrets leak.
