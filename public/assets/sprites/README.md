# Sprites

Anything listed in `manifest.json` is drawn as an (animated) sprite.
Anything **not** listed keeps its built-in vector shape, so you can add art one piece at a time.

Edit `manifest.json`, then reload the page. Problems (a missing file, an unknown sheet) show up as
`[sprites]` warnings in the browser console, and that piece falls back to its shape.

## 1. Add a sheet

Put the image in this folder (or a subfolder) and list it under `"sheets"`:

```jsonc
// A grid of equal-sized frames, numbered 0,1,2... left-to-right, top-to-bottom
{ "key": "my-tank", "type": "spritesheet", "image": "units/tank.png", "frameWidth": 96, "frameHeight": 96 }

// A packed atlas (TexturePacker / Free Texture Packer: export as "Phaser 3" JSON Hash)
{ "key": "buildings", "type": "atlas", "image": "buildings.png", "data": "buildings.json" }

// A single still image
{ "key": "hub-still", "type": "image", "image": "hub.png" }
```

## 2. Point a game object at it

Under `"art"`, use one of these keys:

| What | Keys |
|---|---|
| Base buildings | `building-hub`, `building-extractor`, `building-generator`, `building-refinery`, `building-vault`, `building-battery`, `building-barracks`, `building-vehiclebay` |
| Crystal fields | `field-verdite`, `field-azurite` |
| Your units (battle) | `unit-trooper`, `unit-lancer`, `unit-rover`, `unit-breaker` |
| Raider objects (battle) | `enemy-core`, `enemy-depot`, `enemy-shack`, `enemy-gunnest`, `enemy-cannon`, `enemy-militia`, `enemy-buggy` |
| Base harvester droid (drives around each Extractor) | `drone-harvester` |
| World map | `world-home`, `world-camp` (all camps), or per tier `world-outpost`, `world-fortress` |

```jsonc
"unit-breaker": {
  "sheet": "my-tank",
  "rotate": true,          // turn toward movement/target (draw the art FACING UP)
  "scale": 0.9,            // 1 = fills one tile
  "offsetY": -0.1,         // shift up/down by a fraction of a tile (tall buildings)
  "origin": [0.5, 0.5],
  "anims": {
    "idle":   { "frames": [0, 1], "frameRate": 4 },
    "move":   { "frames": [2, 3, 4, 5], "frameRate": 12 },
    "attack": { "frames": [6, 7, 8], "frameRate": 14 },     // plays once each time it fires
    "death":  { "frames": [9, 10, 11, 12], "frameRate": 12 } // plays once, then the sprite hides
  }
}
```

### Pre-rendered directions (instead of `rotate`)

For art rendered from 8 angles, list the frames in `"directions"`: the first faces the camera (down),
then each next one is turned counter-clockwise (down-right, right, up-right, up, up-left, left, down-left).
The game shows whichever frame matches the way the object is heading.

```jsonc
"drone-harvester": { "sheet": "harvester", "frame": 0, "directions": [0, 1, 2, 3, 4, 5, 6, 7] }
```

To turn a folder of renders into one sheet (same crop for every frame, so nothing jitters):
`python tools/pack_frames.py SpriteSheets client/public/assets/sprites/units/harvester.png --match "000*.png" --size 256 --cols 4 --brighten 1.35`
(run from the project root; frames are taken in filename order, `--match` picks which files).

For atlases, name frames instead of numbering them:
`"idle": { "prefix": "hub_idle_", "start": 0, "end": 7, "zeroPad": 2, "frameRate": 10 }`
matches `hub_idle_00` … `hub_idle_07`. Or list names: `"frames": ["hub_a", "hub_b"]`.

Without an `idle` animation, add `"frame": 0` (or a frame name) to show one still frame.

Animation names the game uses: buildings, fields and world icons play `idle`. Units play
`idle`, `move`, `attack` and `death`. Each one is optional.

## Art tips

- Top-down or 3/4 view, **units facing up**. Enemy units get flipped automatically unless `rotate` is on.
- Square frames work best (64, 96, 128 or 256 px). They're scaled to fit the tile.
- Transparent PNG background.
- The pre-rendered 3D look: model in Blender, put an orthographic camera at a fixed angle,
  render each animation frame, then pack the frames with Free Texture Packer.

`examples/` holds two generated demo sheets (Generator and Rover). Delete their entries
from `manifest.json` to go back to the shapes.
