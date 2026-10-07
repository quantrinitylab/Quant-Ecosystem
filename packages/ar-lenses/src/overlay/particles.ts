import type { ParticleConfig, Particle } from '../types.js';

export class ParticleSystem {
  private config: ParticleConfig;
  private particles: Particle[] = [];
  private elapsed = 0;
  private emitAccumulator = 0;
  private burstFired = false;

  constructor(config: ParticleConfig) {
    this.config = config;
  }

  emit(count?: number): void {
    const toEmit = count ?? this.config.emitRate;
    for (let i = 0; i < toEmit && this.particles.length < this.config.maxParticles; i++) {
      this.particles.push(this.createParticle());
    }
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.elapsed += dt;

    if (this.config.mode === 'continuous') {
      this.emitAccumulator += this.config.emitRate * dt;
      const toEmit = Math.floor(this.emitAccumulator);
      if (toEmit > 0) {
        this.emit(toEmit);
        this.emitAccumulator -= toEmit;
      }
    } else if (this.config.mode === 'burst' && !this.burstFired) {
      this.emit(this.config.maxParticles);
      this.burstFired = true;
    }

    for (const particle of this.particles) {
      particle.velocity.y += this.config.gravity * dt;
      particle.velocity.x += this.config.wind.x * dt;
      particle.velocity.y += this.config.wind.y * dt;
      particle.velocity.z += this.config.wind.z * dt;

      particle.position.x += particle.velocity.x * dt;
      particle.position.y += particle.velocity.y * dt;
      particle.position.z += particle.velocity.z * dt;

      particle.age += dt;
    }

    this.particles = this.particles.filter((p) => p.age < p.lifetime);
  }

  render(): Particle[] {
    return [...this.particles];
  }

  getParticleCount(): number {
    return this.particles.length;
  }

  reset(): void {
    this.particles = [];
    this.elapsed = 0;
    this.emitAccumulator = 0;
    this.burstFired = false;
  }

  private createParticle(): Particle {
    return {
      position: { x: 0, y: 0, z: 0 },
      velocity: { ...this.config.initialVelocity },
      lifetime: this.config.lifetime,
      age: 0,
      size: this.config.size,
      color: this.config.color,
    };
  }
}
