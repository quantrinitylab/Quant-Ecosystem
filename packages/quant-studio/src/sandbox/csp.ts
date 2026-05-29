import { Permission } from '../types.js';

export class CSPBuilder {
  private readonly permissions: Set<Permission>;

  constructor(permissions: Permission[]) {
    this.permissions = new Set(permissions);
  }

  generate(): string {
    const directives: string[] = ["default-src 'none'", "script-src 'self'", "style-src 'self'"];

    if (this.permissions.has(Permission.Network)) {
      directives.push("connect-src 'self' https:");
    }

    if (this.permissions.has(Permission.Camera)) {
      directives.push("media-src 'self'");
    }

    if (this.permissions.has(Permission.Storage)) {
      directives.push("img-src 'self' data: blob:");
    }

    if (this.permissions.has(Permission.AI)) {
      directives.push("worker-src 'self'");
    }

    return directives.join('; ');
  }
}
