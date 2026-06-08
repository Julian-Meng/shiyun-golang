// Shared spiral-galaxy constants so the decorative backdrop (Galaxy) and the 29k poet
// stars (PoetStars) wind into the SAME arms. Recipe: Bruno Simon "Galaxy Generator"
// branch+spin skeleton + logarithmic twist + bulge + 3-stop colour.
export const GALAXY = {
  RADIUS: 3600,
  BRANCHES: 4, // grand-design arms (2 brighter feels MW-like; 4 reads fuller)
  TWIST: 5.2, // radians of winding from centre to edge
  ARM_SPREAD: 0.42, // gaussian angular σ of an arm
  THICKNESS: 0.07, // thin disk (|y| fraction of radius)
};

// cheap Irwin–Hall gaussian ~ N(0, ~0.5) from three uniforms in [0,1)
export function gauss3(a: number, b: number, c: number): number {
  return a + b + c - 1.5;
}
