# Fog

## Start

- While the game loads, the screen says what it prepares: the shaders, the fog noise with its progress, the photo.
- The scene opens covered by fog that hides it completely. The fog is denser near the ground and has clumps.
- Every part of the view starts behind the same amount of fog, whether its surface is a near railing or the sky. The "Thickness" setting sets that amount.
- The fog always moves a little: it swirls. The "Drift" setting adds a steady wind, and it is off by default.

## Wind

- A mouse blows while it moves, with or without a button.
- A pressed mouse button or a finger on the screen also blows outward from that point, and away into the scene.
- The blow starts faint and grows to full strength over one second of holding.
- The wind pushes the fog along the move and brings clean air, so the photo shows through.
- In every part of the view, the wind reaches the air in front of the surface there, up to the sky.
- The fog nearest the viewer shields the fog behind it from the wind, so the view opens layer by layer.
- A deep column of fog, such as the sky, clears in about as many swipes as a short one in front of a near roof.
- The fog does not grow back. Fog that the wind pushes past the edge of the screen or into the distance is gone for good.
- Fog that stays on the screen keeps swirling and creeps into clear air.
- Fog lives only in front of the surfaces of the photo. Fog that drifts behind a building, into a wall or under the ground is gone, so no fog hides where the wind cannot reach.
- Air that the wind set moving opens the edge of the screen it reaches, for about two seconds after the wind stops. Fog it carries out does not flow back in. Elsewhere the air beyond the edge is like the air at the edge.
- The "Return speed" setting makes the fog flow back to its base state. It is off by default.

## Depth

- The fog stops at the surface of the photo, so it lies in front of buildings and hides behind them.
- Buildings and the ground are solid for the fog.
- The fog is never brighter than the sky of the scene, so thinned fog does not glare.

## Settings

- The menu is one row: the algorithm, the quality, the Settings button ⚙ and the hide button –. Every other setting is behind ⚙.
- The hide button folds the menu into one small button with the frame rate. Tapping it brings the menu back.
- The quality has three levels: low, medium and high. Medium is the default.
- Changing the algorithm or the quality starts the fog again from its base state.
- The settings the player changed are kept in the browser for the next visit. The others follow the defaults of the current version.
- "Next scene" opens another scene from the manifest, when there is more than one.
