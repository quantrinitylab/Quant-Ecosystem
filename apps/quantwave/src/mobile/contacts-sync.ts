// Quantads - Contacts Sync Service
// Mobile contacts synchronization for advertising platform

export interface DeviceContact {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumbers: PhoneEntry[];
  emails: EmailEntry[];
  avatar?: string;
  organization?: string;
}

export interface PhoneEntry {
  label: string;
  number: string;
  normalized: string;
}

export interface EmailEntry {
  label: string;
  address: string;
  normalized: string;
}

export interface RegisteredUser {
  userId: string;
  displayName: string;
  avatar: string;
  matchedBy: 'phone' | 'email';
  matchedValue: string;
}

export interface ContactSyncStatus {
  lastSyncAt: number;
  totalContacts: number;
  matchedContacts: number;
  pendingInvites: number;
  syncState: 'idle' | 'syncing' | 'error';
  errorMessage?: string;
}

export interface InviteOptions {
  method: 'sms' | 'email' | 'whatsapp' | 'share_sheet';
  message: string;
  deepLink: string;
  referralCode?: string;
}

export interface ContactPermission {
  status: 'granted' | 'denied' | 'not_determined' | 'restricted';
  canRequest: boolean;
}

export interface ConnectionSuggestion {
  userId: string;
  displayName: string;
  avatar: string;
  mutualConnections: number;
  reason: 'business_network';
  confidence: number;
}

export class ContactsSyncService {
  private contacts: Map<string, DeviceContact> = new Map();
  private registeredMatches: Map<string, RegisteredUser> = new Map();
  private syncStatus: ContactSyncStatus = {
    lastSyncAt: 0,
    totalContacts: 0,
    matchedContacts: 0,
    pendingInvites: 0,
    syncState: 'idle',
  };
  private permissionStatus: ContactPermission = { status: 'not_determined', canRequest: true };
  private invitedContacts: Set<string> = new Set();

  public async requestPermission(): Promise<ContactPermission> {
    this.permissionStatus = { status: 'granted', canRequest: false };
    return this.permissionStatus;
  }

  public getPermissionStatus(): ContactPermission {
    return this.permissionStatus;
  }

  public async importContacts(): Promise<DeviceContact[]> {
    if (this.permissionStatus.status !== 'granted') {
      throw new Error('Contact permission not granted');
    }
    this.syncStatus.syncState = 'syncing';
    const imported: DeviceContact[] = [];
    this.syncStatus.totalContacts = imported.length;
    this.syncStatus.syncState = 'idle';
    this.syncStatus.lastSyncAt = Date.now();
    return imported;
  }

  public async findFriends(contacts: DeviceContact[]): Promise<RegisteredUser[]> {
    const matches: RegisteredUser[] = [];
    for (const contact of contacts) {
      const phoneHashes = contact.phoneNumbers.map((p) => this.hashValue(p.normalized));
      const emailHashes = contact.emails.map((e) => this.hashValue(e.normalized));
      const phoneMatch = await this.checkRegistered(phoneHashes, 'phone');
      const emailMatch = await this.checkRegistered(emailHashes, 'email');
      if (phoneMatch) matches.push(phoneMatch);
      else if (emailMatch) matches.push(emailMatch);
    }
    this.syncStatus.matchedContacts = matches.length;
    matches.forEach((m) => this.registeredMatches.set(m.userId, m));
    return matches;
  }

  private hashValue(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private async checkRegistered(
    _hashes: string[],
    _type: 'phone' | 'email',
  ): Promise<RegisteredUser | null> {
    if (_hashes.length === 0) return null;
    return null;
  }

  public async invite(contactId: string, _options: InviteOptions): Promise<boolean> {
    const contact = this.contacts.get(contactId);
    if (!contact) return false;
    this.invitedContacts.add(contactId);
    this.syncStatus.pendingInvites++;
    return true;
  }

  public isInvited(contactId: string): boolean {
    return this.invitedContacts.has(contactId);
  }

  public normalizePhoneNumber(phone: string): string {
    let normalized = phone.replace(/[\s\-\(\)\.]/g, '');
    if (!normalized.startsWith('+')) {
      normalized = '+1' + normalized;
    }
    return normalized;
  }

  public normalizeEmail(email: string): string {
    const [local, domain] = email.toLowerCase().trim().split('@');
    const cleanLocal = (local ?? '').split('+')[0]!.replace(/\./g, '');
    return cleanLocal + '@' + (domain ?? '');
  }

  public matchAlgorithm(
    contact: DeviceContact,
    registeredUsers: RegisteredUser[],
  ): RegisteredUser | null {
    for (const user of registeredUsers) {
      for (const phone of contact.phoneNumbers) {
        if (this.normalizePhoneNumber(phone.number) === user.matchedValue) return user;
      }
      for (const email of contact.emails) {
        if (this.normalizeEmail(email.address) === user.matchedValue) return user;
      }
    }
    return null;
  }

  public async suggestConnections(): Promise<ConnectionSuggestion[]> {
    const suggestions: ConnectionSuggestion[] = [];
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  public getSyncStatus(): ContactSyncStatus {
    return { ...this.syncStatus };
  }

  public getRegisteredMatches(): RegisteredUser[] {
    return Array.from(this.registeredMatches.values());
  }

  public clearSyncData(): void {
    this.contacts.clear();
    this.registeredMatches.clear();
    this.invitedContacts.clear();
    this.syncStatus = {
      lastSyncAt: 0,
      totalContacts: 0,
      matchedContacts: 0,
      pendingInvites: 0,
      syncState: 'idle',
    };
  }
}
