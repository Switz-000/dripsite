// Plain backdrop with a floor: for trying out moves and presets without a set getting in the way.
// Spots: left, centre, right (standing).
export default {
  scale: 0.85,
  spots: {
    left:   { x: 380, ground: 690 },
    centre: { x: 640, ground: 690 },
    right:  { x: 900, ground: 690 },
  },
  back() {
    return `<rect width="1280" height="720" fill="#efe9dc"/>
  <rect y="612" width="1280" height="108" fill="#ddd3bf"/><path d="M0 612 L1280 612" stroke="#c9bea6" stroke-width="4"/>`
  },
}
