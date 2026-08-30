# Glyphropolis

An immersive, first-person ASCII city: a seeded procedural metropolis rendered entirely as text glyphs, roamed on foot with no objectives. Deployed as a pure static web experience.

## World

**The City (城)**:
The endless procedurally generated world the player roams, produced entirely from the Seed.
_Avoid_: map, level, world ID

**Seed (种子)**:
The gene of the City: the same Seed always yields the same City. Carried in the page URL so any view can be shared.
_Avoid_: world key, save file

**Chunk (地块)**:
A rectangular unit of the City that is generated and loaded as the player moves.
_Avoid_: tile, region, zone

**District (街区)**:
An area of the City with its own density and character (downtown, residential, park, industrial).
_Avoid_: biome, neighborhood

**Landmark (地标)**:
A unique, hand-shaped structure that anchors orientation within the City.
_Avoid_: POI, point of interest

## Display

**Glyph (字符)**:
The atom of all visuals: every part of the City is shown as a glyph.
_Avoid_: char, letter, character sprite

**Cell (格)**:
One position of the textmode screen, holding exactly one Glyph with its colors. The Cell is the slot; the Glyph is the content.
_Avoid_: pixel, tile, character cell

**Textmode (字符画面)**:
The final glyph image the player sees, produced from the rendered 3D scene.
_Avoid_: ASCII render, framebuffer, post-effect

**Ambient (环境光)**:
The single global light factor that day and night lerp through every color of the City.
_Avoid_: global illumination, sun level, brightness

**CRT Mode (复古模式)**:
The monochrome terminal look offered as a toggle over the default colored neon display.
_Avoid_: green mode, matrix mode, retro filter

## Experience

**The Walk (漫游)**:
The core experience: free first-person movement through the City with no objectives.
_Avoid_: gameplay, game mode, campaign

**Boot (开机)**:
The black-screen glyph animation of the project name played before the City appears.
_Avoid_: loading screen, splash, intro

**Bloom (绽放)**:
The opening reveal in which the Textmode sweeps outward from the center Cell of the screen like a wave, materializing the City around the player.
_Avoid_: intro animation, reveal effect, transition

**Eject (弹射)**:
The act of charging (holding E) and releasing an upward launch from any solid surface the player stands on. Charge time decides launch strength.
_Avoid_: jump, teleport, warp

**Charge (蓄力)**:
The held state before an Eject: a vertical bar on the left edge of the screen fills while the screen corners darken, previewing the launch height. Releasing E fires the launch.
_Avoid_: loading, cooldown, meter

**Shuttle (穿梭机)**:
The movement mode after an Eject: inertial gliding with soft gravity, SHIFT thrusting along the look direction. It replaces the Walk until the next Touchdown. Not a vehicle, not a fly camera — a body in glide.
_Avoid_: fly mode, jetpack, noclip

**Touchdown (落地)**:
The moment the Shuttle meets any solid surface and the mode ends. Soft if the descent is gentle; heavy landings bounce once with a screen shake before settling.
_Avoid_: landing animation, crash, respawn

**Altitude Rail (海拔线)**:
The vertical scale docked at the right edge of the screen while shuttling: a tick every 10 m, a labelled line every 50 m, a pointer at the player's absolute altitude (street level = 0 m).
_Avoid_: minimap, radar, minimeter
