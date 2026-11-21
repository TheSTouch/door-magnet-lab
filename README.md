# Sliding door: magnetic latch and slow-down

Design and test, in a physics simulation first, a way to slow a barn-style sliding
door and latch it at both ends with magnets, using the existing stoppers.

## The door (from the photos, 2026-11-21)

- Door about 80 × 200 cm, about 12 kg, oak-look panel.
- Rail: black powder-coated steel flat bar on wall standoffs. Two hanger straps with
  grooved wheels riding on top of the bar, and a flat steel plate screwed to the top
  of the door at each hanger.
- Stoppers: a steel U-clamp around the bar with a rubber bumper facing the hanger
  strap. Its lower lobe hangs below the bar, and the plate on top of the door slides
  under it as the hanger reaches the bumper. The open-side stopper mirrors the
  closed-side one.
- Photos: [`photos/`](photos/) (converted from HEIC, metadata stripped).

## The idea

1. **Latch:** a 3D-printed magnet box, designed in a separate OpenSCAD project
   (40 × 23 × 25 mm, one or two Ø15 × 5 mm magnets under a 0.4 mm skin) goes on the
   stopper's lower lobe with the magnets facing down onto the door's steel plate. As
   the plate slides under, the magnets pull it in sideways and hold it against the
   bumper. The v1 box does not fit the stopper yet, and the simulation needs the
   stopper's real dimensions.
2. **Slow-down:** magnets on their own do not absorb energy. A latch adds energy
   on the way in, and a bouncy bumper sends the door back out. Two ways to slow it
   are modelled:
   - eddy currents: a copper or aluminium sheet moving past magnets,
   - a deader (lower-bounce) bumper.

## The simulator: `web/`

Open `web/index.html` in a browser (double-click is enough; no server and no
internet needed).

- **Left panel:** every parameter. A ✓ means the value was measured by the owner;
  everything else is a default until measured. Values are kept in the browser.
- **Tests:** push it closed, push it open, pull it out of the latch. Each one plays
  back in slow motion on the whole rail and on the stopper close-up.
- **Results:** outcome, speed at the bumper, peak bumper force, rebound, the pull
  needed to open, and a capture estimate (the fastest impact the latch can still hold
  for the current bounce).
- **Charts:** distance, speed and forces over time; latch force against distance
  from the bumper; a sweep of push speeds showing which ones end latched.
- **URL hash** to reopen a setup or a moment, for example
  `index.html#test=pull&t=0.5&brake.mode=hanger&latch.airGap=1.5`.

### Physics (in `web/physics.js`)

| Part | Model |
|------|-------|
| Rolling | constant coefficient × weight, with stiction |
| Bumper | Hunt–Crossley contact `F = k d^1.5 (1 + c d'/v_in)`, damping set from a restitution value |
| Magnet pull | on-axis field of a cylinder magnet plus its image in the plate, scaled so Ø15 × 5 N42 ≈ 46 N on contact (or use the seller's figure); thin-plate saturation estimate |
| Latch (sideways) | energy method: the pull integrated from the gap outwards (U0) is released as the plate slides under the magnet, spread over the magnet's chord, with fringing blur growing with the gap |
| Eddy brake | `F = c v / (1 + (v/vc)^2)`. `c` is solved numerically in `web/eddy.js`: thin-sheet currents on the real strip width (Neumann edges, exact DCT Poisson solve), exact off-axis field of each disc magnet, alternating poles, mirror image for the steel behind the strip. Checked against the exact point-dipole result to 0.05 % |

All of these are estimates to be calibrated on the real door. The model ranks
designs well; the exact numbers need the measurements listed at the bottom of the
page.

## First results with the default values (not yet measured)

- Two Ø15 × 5 N42 magnets with a 2.4 mm gap hold the door shut with about 5 N
  (0.55 kg on a luggage scale) and store about 0.1 J.
- With a bumper bounce of 0.5, that catches a door only if it hits the bumper below
  about 0.25 m/s. A normal 0.8 m/s push carries 3.9 J and bounces back out.
- A copper sheet under the latch magnets barely slows it: there is room for only a
  short strip.
- Rail strip with 8 × Ø15 × 5 mm magnets on the hanger, 16 mm apart, 3 mm from a
  30 × 2 mm copper strip (eddy-current solution):
  - **Alternate N/S** along the row: 7.8 N·s/m. With all the same way round it drops
    to 0.9 N·s/m, 8× less.
  - **Width:** 15 / 20 / 25 / 30 / 40 mm give 54 / 77 / 90 / 96 / 99 % of a very wide
    strip.
  - **Thickness:** copper tape (0.05 mm) 0.4, copper 1 mm 5.8, copper 2 mm 7.8,
    copper 3 mm 8.1 N·s/m. The steel rail behind the strip multiplies it by 2.6.
  - A 0.8 m/s push arrives at 0.63 m/s with 250 mm of strip, 0.45 m/s with 400 mm.
- An eddy brake takes about the same speed, `c × length / mass`, off every push.
  Any push slower than that stops in the strip before it reaches the latch. One
  strip cannot both stop hard pushes and let gentle ones through; gentle closes
  need something that keeps pulling the door in (slope, spring, long-reach magnet).

## License

[MIT](LICENSE). Contributions and corrections to the physics are welcome; open an
issue or a pull request.

## Status

| Date | Change |
|------|--------|
| 2026-11-21 | Photos reviewed; simulator v1 with latch, bumper, eddy brake, three tests, speed sweep |
| 2026-11-21 | Published as open source (MIT) |
