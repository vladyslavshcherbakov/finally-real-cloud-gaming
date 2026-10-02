export class WindSource {
  constructor({ u, v, velocityU, velocityV, radius, strength, outwardStrength }) {
    this.u = u;
    this.v = v;
    this.velocityU = velocityU;
    this.velocityV = velocityV;
    this.radius = radius;
    this.strength = strength;
    this.outwardStrength = outwardStrength;
  }
}
