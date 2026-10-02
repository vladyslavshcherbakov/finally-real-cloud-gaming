# Fog

## Start

- While the game loads, the screen says what it prepares: the shaders, the fog noise with its progress, the photo.
- The scene opens covered by fog that hides it completely. The fog is denser near the ground and has clumps.
- Every part of the view starts behind the same amount of fog, whether its surface is a near railing or the sky. The "Thickness" setting sets that amount.
- The fog stands still until the player blows. The "Turbulence" setting makes it swirl, and it is off by default. Fog nearer than 15 m swirls across the screen no faster than fog at 15 m, so the air right in front of the viewer stays calm.
- The "Drift" setting adds a steady wind, and it is off by default.

## Wind

- A mouse blows while it moves, with or without a button. Without a button it blows at a third of the strength, so moving it to a spot thins only the nearest fog on the way and leaves fog there to blow away.
- A tap, or a pressed mouse button, blows at full strength at once in every direction from that point and away into the scene. After it is lifted, the blow fades out over half a second, so a short tap still makes a puff.
- As the finger moves, the blow turns from every direction into the direction of the move, and a quick move blows only along it.
- Once the finger has travelled a twentieth of the screen, the press is a swipe. Stopping or lifting it then blows in no direction of its own, so the air flies on and does not spring back.
- Four quick circles in a row, with a finger, a pressed mouse or a mouse without a button, start a vortex at the centre of the circle, as wide as the circle and turning the same way. While the circling goes on, the vortex follows it. It turns the whole depth of the fog at once, about once a second at the wall of its eye and slower farther out, so the fog around it winds into spiral arms. It pulls the air toward its eye and carries it into the scene there, and the fog thins away only in the eye. The longer the circling goes on, the farther it pulls: over four seconds its pull grows from three to ten times its own radius, so sooner or later it draws in the fog around it, like water down a drain. When the circles drift, the far end of the vortex trails the way they drift, like the tail of a tornado. While a pointer spins a vortex, its own wind blows at a quarter of its strength, so the vortex leads. A mouse without a button makes a vortex as strong as the blow of a pressed pointer, and a finger or a pressed mouse makes it half as strong again. When the circling stops, the vortex fades out over four seconds.
- When the wind stops, the air keeps flying across the screen in the direction of the move for about a second, like a shot of air, and carries the fog it caught further that way. Into the scene it settles within a fraction of a second.
- The wind carries the fog along the move and a little away into the scene. A moving blow also spreads the air out to both sides of its path, like the air from a nozzle, so each pass opens a wider lane. Fog it carries past the edge of the screen or into the distance is gone.
- Air the wind set moving mixes clean air into the fog it carries for about two seconds, wherever that air flows. Each pass over a spot thins the fog the air has reached by about the same amount, however fast the pass.
- That mixing reaches the far fog as weakly as the wind does.
- In every part of the view, the wind reaches the air in front of the surface there, up to the sky.
- The wind acts on the whole volume of fog between the viewer and the surface at once, with no layers and no front. Before it builds up, it reaches the fog right in front of the viewer at full strength and the fog at the surface with a fifth of it, falling smoothly in between, so the near fog thins a little faster. Two seconds of a full blow over a part of the view bring it to full strength through the whole depth there. Swipes and taps add up, and the air settles again over four seconds of calm. The same gesture clears every part of the view at the same pace, so no outline of the scene stays filled with fog. The wind clears a part of the view faster in proportion to how much fog is in front of its surface, so every pass shows a little more of the photo, and the photo does not stay hidden for many passes and then appear at once.
- Over the sky, the fog ends at the same depth as everywhere else. No haze beyond that depth hides the sky.
- The fog does not grow back. Fog that the wind pushes past the edge of the screen or into the distance is gone for good.
- Fog that stays on the screen creeps into clear air. It does not creep behind surfaces, so still fog keeps its amount.
- Fog lives only in front of the surfaces of the photo. Behind a surface each cell only repeats the fog just in front of it, so fog that swirls against a building is neither lost nor kept hidden where the wind cannot reach.
- Without wind the fog never thins by itself.
- Air that the wind set moving opens the edge of the screen it reaches, for about two seconds after the wind stops. Fog it carries out does not flow back in. Elsewhere the air beyond the edge is like the air at the edge.
- The "Return speed" setting makes the fog flow back to its base state. It is off by default.

## Depth

- The fog stops at the surface of the photo, so it lies in front of buildings and hides behind them.
- Buildings and the ground are solid for the fog.
- The fog is never brighter than the sky of the scene, so thinned fog does not glare.
- The fog is lit as one even layer, so its light and shade do not trace the shapes behind it.

## Settings

- The menu is one row: the algorithm, the quality, the Settings button ⚙ and the hide button –. Every other setting is behind ⚙.
- The hide button folds the menu into one small button with the frame rate. Tapping it brings the menu back.
- The quality has three levels: low, medium and high. Medium is the default.
- Changing the algorithm or the quality starts the fog again from its base state.
- The settings the player changed are kept in the browser for the next visit. The others follow the defaults of the current version.
- "Next scene" opens another scene from the manifest, when there is more than one.
