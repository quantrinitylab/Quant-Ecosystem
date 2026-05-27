// ============================================================================
// QuantMail - Signature Builder Service
// Build and manage HTML email signatures with structured fields
// ============================================================================

export interface SignatureField {
  type: 'name' | 'title' | 'company' | 'phone' | 'email' | 'website' | 'social' | 'image';
  value: string;
}

export interface EmailSignature {
  id: string;
  name: string;
  isDefault: boolean;
  html: string;
  fields: SignatureField[];
}

export class SignatureBuilderService {
  private signatures: Map<string, EmailSignature> = new Map();
  private signatureCounter = 0;

  create(name: string, fields: SignatureField[]): EmailSignature {
    this.signatureCounter += 1;

    const signature: EmailSignature = {
      id: `sig-${this.signatureCounter}`,
      name,
      isDefault: this.signatures.size === 0, // First signature is default
      html: '',
      fields,
    };

    signature.html = this.renderHtml(signature);
    this.signatures.set(signature.id, signature);
    return signature;
  }

  update(id: string, fields: SignatureField[]): EmailSignature | null {
    const existing = this.signatures.get(id);
    if (!existing) {
      return null;
    }

    const updated: EmailSignature = {
      ...existing,
      fields,
      html: '',
    };
    updated.html = this.renderHtml(updated);
    this.signatures.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    const signature = this.signatures.get(id);
    if (!signature) {
      return false;
    }

    const wasDefault = signature.isDefault;
    this.signatures.delete(id);

    // If deleted signature was default, make another one default
    if (wasDefault && this.signatures.size > 0) {
      const first = this.signatures.values().next().value;
      if (first) {
        this.signatures.set(first.id, { ...first, isDefault: true });
      }
    }

    return true;
  }

  setDefault(id: string): void {
    const target = this.signatures.get(id);
    if (!target) {
      return;
    }

    // Remove default from all others
    for (const [sigId, sig] of this.signatures.entries()) {
      if (sig.isDefault && sigId !== id) {
        this.signatures.set(sigId, { ...sig, isDefault: false });
      }
    }

    this.signatures.set(id, { ...target, isDefault: true });
  }

  getDefault(): EmailSignature | null {
    for (const sig of this.signatures.values()) {
      if (sig.isDefault) {
        return sig;
      }
    }
    return null;
  }

  list(): EmailSignature[] {
    return Array.from(this.signatures.values());
  }

  renderHtml(signature: EmailSignature): string {
    const parts: string[] = ['<div style="font-family: Arial, sans-serif; font-size: 14px;">'];

    for (const field of signature.fields) {
      switch (field.type) {
        case 'name':
          parts.push(`<p style="font-weight: bold; margin: 0;">${this.escape(field.value)}</p>`);
          break;
        case 'title':
          parts.push(`<p style="color: #666; margin: 2px 0;">${this.escape(field.value)}</p>`);
          break;
        case 'company':
          parts.push(
            `<p style="font-weight: bold; color: #333; margin: 2px 0;">${this.escape(field.value)}</p>`,
          );
          break;
        case 'phone':
          parts.push(
            `<p style="margin: 2px 0;"><a href="tel:${this.escape(field.value)}">${this.escape(field.value)}</a></p>`,
          );
          break;
        case 'email':
          parts.push(
            `<p style="margin: 2px 0;"><a href="mailto:${this.escape(field.value)}">${this.escape(field.value)}</a></p>`,
          );
          break;
        case 'website':
          parts.push(
            `<p style="margin: 2px 0;"><a href="${this.escape(field.value)}">${this.escape(field.value)}</a></p>`,
          );
          break;
        case 'social':
          parts.push(
            `<p style="margin: 2px 0;"><a href="${this.escape(field.value)}">${this.escape(field.value)}</a></p>`,
          );
          break;
        case 'image':
          parts.push(
            `<img src="${this.escape(field.value)}" alt="signature" style="max-width: 200px; margin: 4px 0;" />`,
          );
          break;
      }
    }

    parts.push('</div>');
    return parts.join('');
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
