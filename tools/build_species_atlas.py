#!/usr/bin/env python3
"""
Build the species atlas from the 30 hand-drawn ant sprites.

    python3 tools/build_species_atlas.py

Reads `assets/source-sprites/30 Ant Sprites/<size>/<species>/<anim>.gif` and
writes `assets/ants_species_atlas.png` plus `js/core/species_atlas.js`, the
generated table the game reads.

WHY THE TOP-LEVEL GIF AND NOT THE FOLDER UNDER IT
-------------------------------------------------
Each animation ships three ways and only one of them is the animation:

    to walk.gif          the composed ant, 32 frames   <- this one
    to walk/1.gif        the GASTER layer alone, 16 frames
    to walk/2.gif        another body layer
    to walk/3.gif        another body layer
    to walk/to walk.png  a layered contact sheet, 16 columns by 4 rows

The numbered GIFs look like frames and are not — `1.gif` renders as a
disembodied abdomen. The PNG looks like a sprite sheet and is not either; it is
the artist's working contact sheet with the body split into rows, at irregular
widths. Only the top-level GIF is a whole animated ant.

WHY A SEPARATE ATLAS
--------------------
`assets/ants_atlas.png` is the existing hand-made 6x4 sheet the game already
draws from, and it stays exactly as it is. Adding species as extra rows of that
file would mean regenerating it, which risks the four roles that already work
for the sake of a feature that is purely additive. The blitter takes a sheet
descriptor, so a second sheet costs one argument.

THE ANT FACES +X
----------------
`drawAntSprite` rotates by a heading where 0 is +x, and these sprites are drawn
head-right. They therefore need no rotation offset, which is worth stating
because it is the kind of thing that is discovered by a whole colony walking
backwards.
"""

import json
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'assets', 'source-sprites', '30 Ant Sprites')
ATLAS_PNG = os.path.join(ROOT, 'assets', 'ants_species_atlas.png')
ATLAS_JS = os.path.join(ROOT, 'js', 'core', 'species_atlas.js')

CELL = 64
FRAMES_PER_ANIM = 3

# The order matters: `walk` and `carry` sit at columns 0-2 and 3-5 so this sheet
# is column-compatible with the existing one, and anything that already knows
# the old layout keeps working against this one unchanged.
#
# There is no carry animation in the source, so `run` stands in for it — a
# laden ant scurrying is closer to a run than to a stroll. `breating` is the
# artist's spelling and is kept, since renaming it here would only mean the
# filename and the code disagree.
ANIMS = [
    ('walk', 'to walk'),
    ('carry', 'run'),
    ('attack', 'attack'),
    ('idle', 'breating'),
]
COLS = len(ANIMS) * FRAMES_PER_ANIM

# What each animation may be called on disk.
#
# Hand-named folders from a few years ago do not obey a scheme, and matching the
# tidy name alone silently lost three species to nothing but filenames: the Fire
# ant's files are `2 - to walk.gif` and ` attack.gif` with a LEADING SPACE, the
# Yellow Meadow Ant's are all prefixed `1 - `, and the Honey ants' breathing is
# `breatingb.gif`. They came out of the first build as four transparent squares
# each, which in play is an invisible ant rather than an error.
#
# `breating` is the artist's spelling of breathing and appears both ways.
ALIASES = {
    'to walk': ('towalk', 'walk'),
    'run': ('run',),
    'attack': ('attack',),
    'breating': ('breating', 'breatingb', 'breathe', 'breath', 'breathing'),
}


def normalise(filename):
    """A filename reduced to the thing it is naming."""
    stem = os.path.splitext(filename)[0].lower()
    stem = re.sub(r'^\s*\d+\s*-\s*', '', stem)     # a `1 - ` or `2 - ` prefix
    return re.sub(r'[^a-z]', '', stem)             # spaces, digits, punctuation


def find_gif(folder, wanted):
    """
    The GIF in `folder` for animation `wanted`, whatever it happens to be called.

    Exact aliases first, then a suffix match, so the Fire ant's ` fire attack`
    can stand in for an attack she does not otherwise have — while a plain
    `attack` still wins over it wherever both exist.
    """
    names = [f for f in os.listdir(folder)
             if f.lower().endswith('.gif') and os.path.isfile(os.path.join(folder, f))]
    keys = ALIASES[wanted]
    for name in sorted(names):
        if normalise(name) in keys:
            return os.path.join(folder, name)
    for name in sorted(names):
        if any(normalise(name).endswith(k) for k in keys):
            return os.path.join(folder, name)
    return None


def species_list():
    """Every species, ordered small to large so a row index means something."""
    out = []
    for size in ('Small', 'Medium', 'Large'):
        folder = os.path.join(SOURCE, size)
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            if os.path.isdir(os.path.join(folder, name)):
                out.append((size, name))
    return out


def frames_of(path):
    """Every frame of a GIF, as RGBA."""
    im = Image.open(path)
    out = []
    for i in range(getattr(im, 'n_frames', 1)):
        im.seek(i)
        out.append(im.convert('RGBA'))
    return out


def content_box(frames):
    """
    The union of every frame's ink.

    Per-frame cropping is the obvious thing and it is wrong: each frame would be
    centred on its own bounding box, so an ant whose legs reach further on frame
    2 than on frame 1 would appear to shuffle sideways on the spot. One box for
    the whole animation keeps her still while her legs move.
    """
    box = None
    for frame in frames:
        b = frame.getbbox()
        if b is None:
            continue
        box = b if box is None else (
            min(box[0], b[0]), min(box[1], b[1]),
            max(box[2], b[2]), max(box[3], b[3]),
        )
    return box


def pick(frames, count):
    """`count` frames spread evenly through the cycle."""
    if len(frames) <= count:
        return frames + [frames[-1]] * (count - len(frames))
    return [frames[round(i * len(frames) / count)] for i in range(count)]


def cell_for(frame, box):
    """One frame, cropped to the shared box and fitted into a CELL square."""
    cut = frame.crop(box)
    scale = min(CELL / cut.width, CELL / cut.height)
    w = max(1, round(cut.width * scale))
    h = max(1, round(cut.height * scale))
    cut = cut.resize((w, h), Image.LANCZOS)
    cell = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    cell.paste(cut, ((CELL - w) // 2, (CELL - h) // 2), cut)
    return cell


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def main():
    species = species_list()
    if not species:
        sys.exit(f'no sprites under {SOURCE}')

    atlas = Image.new('RGBA', (COLS * CELL, len(species) * CELL), (0, 0, 0, 0))
    table = []
    missing = []

    for row, (size, name) in enumerate(species):
        folder = os.path.join(SOURCE, size, name)
        entry = {'id': slug(name), 'name': name, 'size': size.lower(), 'row': row}
        for a, (key, filename) in enumerate(ANIMS):
            path = find_gif(folder, filename)
            if path is None:
                # Recorded rather than skipped silently. A species missing its
                # attack should show up as a line in the build, not as a
                # transparent square somebody finds in play.
                missing.append(f'{size}/{name}/{filename}')
                continue
            frames = frames_of(path)
            box = content_box(frames)
            if box is None:
                missing.append(f'{size}/{name}/{filename} (blank)')
                continue
            for f, frame in enumerate(pick(frames, FRAMES_PER_ANIM)):
                atlas.paste(cell_for(frame, box), ((a * FRAMES_PER_ANIM + f) * CELL, row * CELL))
        table.append(entry)

    os.makedirs(os.path.dirname(ATLAS_PNG), exist_ok=True)
    atlas.save(ATLAS_PNG, optimize=True)

    anims = {}
    for a, (key, _) in enumerate(ANIMS):
        anims[key] = [a * FRAMES_PER_ANIM + f for f in range(FRAMES_PER_ANIM)]

    with open(ATLAS_JS, 'w') as out:
        out.write(f"""/* ============================================================
   species_atlas.js — GENERATED by tools/build_species_atlas.py.
   ------------------------------------------------------------
   Do not hand-edit: rerun the tool. It reads the 30 hand-drawn ant sprites in
   assets/source-sprites and writes both this table and the sheet it describes.

   The existing 6x4 assets/ants_atlas.png is untouched and still drives the four
   roles. This is additive: {len(species)} species, laid out small to large, with
   walk and carry at the same columns as the old sheet so the two are
   interchangeable.
   ============================================================ */

const SPECIES_SPRITE = {{
  src: 'assets/ants_species_atlas.png',
  cell: {CELL}, cols: {COLS}, rows: {len(species)},
  {chr(10).join(f'  {k}: {json.dumps(v)},' for k, v in anims.items())}
  fps: 9,
}};

/* Row order is the atlas's row order — small ants first. */
const ANT_SPECIES = {json.dumps(table, indent=2)};
""")

    print(f'{len(species)} species -> {atlas.size[0]}x{atlas.size[1]} '
          f'({os.path.getsize(ATLAS_PNG) / 1024:.0f} KB)')
    for m in missing:
        print(f'  missing: {m}')


if __name__ == '__main__':
    main()
