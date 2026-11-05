# NewYearSimulator — Winter Academy RPG

Roblox Luau project managed with Rojo 7.

This branch is an expanded playable vertical-slice foundation for the original Winter Academy simulator. It includes a stylized academy environment, mentor collection, lightning progression, server-authoritative monster encounters, battle rewards, inventory, item sales, crafting, pets/eggs, quest rewards, rebirth confirmation and a Roblox Marketplace integration that is disabled until real product IDs are configured.

## Project structure

- `src/shared/Config.luau` — zones, mentor balance, monsters, combat scaling, item/drop tables, pets/eggs, recipes, quests, Game Pass and Developer Product catalog.
- `src/server/Main.server.luau` — server-authoritative progression, training, combat, reward rolls, inventory, item selling, crafting, pet collection, quests, rebirth and RemoteEvents.
- `src/server/DataService.luau` — player persistence using the existing `NewYearSim_v1` DataStore and `player_<UserId>` keys. It preserves legacy mentor IDs and adds defaults for new systems.
- `src/server/PurchaseService.luau` — server-side Game Pass refresh and idempotent Developer Product receipt processing through an atomic player DataStore update.
- `src/server/WinterAcademy.server.luau` — generated academy, mentor gallery, training court, runic arena, lighting and ambient effects.
- `src/client/Client.client.luau` — responsive HUD, animated panels, mentor/world/inventory/quest/pet/crafting/shop/rebirth UI, local companion visuals, combat feedback and reward popups.
- `default.project.json` — Rojo DataModel mapping.

## Playable systems in this branch

- **Progression:** lightning, wins, stage, zone multipliers, mentor multipliers, pet multipliers, weapon bonus, rebirth multiplier, Game Pass multiplier and timed boosts.
- **Mentors:** hire/equip through server-validated actions; in-world mentor displays expose an `E` proximity interaction.
- **Combat:** each player gets an isolated combat lane, server-side attack cooldown and damage calculation, enemy health, player health damage, victory/defeat handling and stage progression.
- **Drops:** stage-gated weighted drop pools create real inventory items after a victory.
- **Inventory:** item counts persist; resources can be sold one at a time; equipped weapon/armor cannot be sold.
- **Crafting:** recipes consume server-validated materials and create weapon/armor items. Gear affects training, damage and defense/health.
- **Pets:** eggs spend Wins, weighted rolls grant pets, pets can be equipped into slots and apply server-side multipliers. Local cosmetic companion models follow the player.
- **Quests:** milestone objectives track kills/stages and award Wins/materials once, stored in player data.
- **Rebirth:** the player sees a confirmation panel; rebirth resets lightning/stage/zone while preserving collection and granting a permanent multiplier.
- **Robux shop:** Game Pass and Developer Product prompts are wired. The catalog intentionally uses ID `0` until the owner creates the products in Creator Dashboard. Unconfigured items are shown as needing an ID and cannot be purchased. Developer Products are granted only by server receipt processing; the premium pet product adds a pet to the saved collection.

## Run locally

From the repository root:

```bash
rokit install
rojo serve
```

Keep the terminal running while Roblox Studio is connected. In Roblox Studio, open the Rojo plugin and connect to the local server.

To build a place file without starting the live server:

```bash
rojo build -o /tmp/NewYearSimulator.rbxlx
```

## Roblox Studio setup and acceptance test

1. Make a separate private test experience; do not use production player data for the first migration tests.
2. Publish that test experience.
3. In **Game Settings → Security**, enable **Studio Access to API Services** for the test experience.
4. Connect Rojo and run the place in Studio.
5. Check the Output window for errors.
6. Complete this test sequence:
   - Join and confirm the new HUD loads with existing player data.
   - Train until the first battle requirement is reached.
   - Open **Наставники**, hire/equip a mentor, and confirm the displayed multiplier updates.
   - Walk to a mentor display and press **E**; the mentor panel should open.
   - Start a fight, attack several times, and observe the enemy health bar, bolt effect and player-health feedback.
   - Win and confirm the reward popup; open **Инвентарь** and confirm the item exists.
   - Sell one resource and confirm Wins increase.
   - Open a pet egg, equip the pet, and confirm it follows the character and boosts training.
   - Craft the **Посох инея** after collecting the required materials; equip it and confirm the bonus applies.
   - Complete a quest and claim its reward only once.
   - Open the rebirth panel, review the reset warning, and confirm a rebirth.
   - Stop and rejoin the test session; confirm inventory, pets, gear, quest claims and progression persist.
   - Repeat at a narrow mobile viewport and inspect for clipped or overlapping UI.

## Robux setup

Before enabling real paid items:
1. Create the Game Passes and Developer Products in the Roblox Creator Dashboard.
2. Paste their real numeric IDs into `Config.GamePasses` and `Config.DeveloperProducts`.
3. Test purchases in a private test experience with test accounts.
4. Verify receipt processing and entitlement refresh before exposing the products to players.

Never paste API keys, access tokens or private credentials into this repository.

## Known limitations — be transparent

- The academy and mentor/pet/monster visuals in this branch are original stylized Roblox Part assemblies. They are more detailed than placeholder blocks but are not imported premium MeshPart rigs. If you want highly polished character models and complex castle meshes, add original licensed meshes/animations; do not invent asset IDs.
- Combat is a first functional click-to-attack loop in isolated lanes. It has server-side health/damage, cooldowns, hit reactions and reward drops, but it is not yet a full real-time pathfinding enemy AI with complex attack combos.
- Pets use lightweight local companion assemblies that follow the player; they are not full rigged animated creatures.
- The current shop has the Marketplace flow but uses ID `0` placeholders. No real Robux purchase can be made until IDs are configured in Creator Dashboard.
- The first vertical slice does not yet contain a full multi-world campaign, boss phase system, pet fusion/upgrading, sell-all/sorting, or a complete daily-event calendar.
- The current generated world is one starting academy/courtyard with a first combat arena. Additional worlds should be built after this slice is verified.
- A successful `rojo build` verifies project mapping/build output only. Runtime behavior, DataStore access, combat feel, receipt flow and mobile layout must be tested manually in Roblox Studio.

## Vercel

Vercel can host web assets or APIs connected to this repository. It does not run the Roblox game server or publish a Roblox experience.
