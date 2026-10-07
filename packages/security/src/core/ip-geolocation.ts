// ============================================================================
// Security Package - IP Geolocation
// ============================================================================

import type { GeoLocation } from '../types';

/** IP geolocation configuration */
interface GeoConfig {
  enableBlocking: boolean;
  blockedCountries: string[];
  allowedCountries: string[];
  vpnDetection: boolean;
  torDetection: boolean;
  proxyDetection: boolean;
  riskThreshold: number;
}

/** Default configuration */
const DEFAULT_CONFIG: GeoConfig = {
  enableBlocking: false,
  blockedCountries: [],
  allowedCountries: [],
  vpnDetection: true,
  torDetection: true,
  proxyDetection: true,
  riskThreshold: 70,
};

/** Known Tor exit node prefixes (simulation) */
const TOR_EXIT_PREFIXES = [
  '185.220.',
  '109.70.',
  '51.15.',
  '198.98.',
  '176.10.',
  '95.211.',
  '192.42.',
];

/** Known VPN provider prefixes (simulation) */
const VPN_PREFIXES = [
  '104.238.',
  '209.58.',
  '45.32.',
  '45.76.',
  '45.77.',
  '66.70.',
  '149.28.',
  '207.246.',
];

/** Known proxy/datacenter prefixes (simulation) */
const PROXY_PREFIXES = ['34.', '35.', '52.', '54.', '13.', '18.', '3.', '172.', '198.51.'];

/**
 * IPGeolocation - IP address geolocation with country blocking, VPN/proxy/Tor detection,
 * risk scoring, and geographic access control.
 */
export class IPGeolocation {
  private config: GeoConfig;
  private cache: Map<string, GeoLocation>;
  private ipRangeDatabase: Map<
    string,
    {
      country: string;
      countryCode: string;
      region: string;
      city: string;
      lat: number;
      lon: number;
      tz: string;
      isp: string;
    }
  >;
  private blockedIPs: Set<string>;
  private lookupCount: number;

  constructor(config: Partial<GeoConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map();
    this.ipRangeDatabase = new Map();
    this.blockedIPs = new Set();
    this.lookupCount = 0;
    this.initializeDatabase();
  }

  /** Look up geolocation for an IP address */
  async lookup(ip: string): Promise<GeoLocation> {
    this.lookupCount++;

    // Check cache
    const cached = this.cache.get(ip);
    if (cached) return cached;

    // Parse IP and determine location
    const location = this.resolveLocation(ip);

    // Detect VPN/Proxy/Tor
    const isVPN = this.config.vpnDetection ? this.detectVPN(ip) : false;
    const isProxy = this.config.proxyDetection ? this.detectProxy(ip) : false;
    const isTor = this.config.torDetection ? this.detectTor(ip) : false;

    // Calculate risk score
    const riskScore = this.calculateRiskScore(ip, isVPN, isProxy, isTor, location.countryCode);

    const geo: GeoLocation = {
      ip,
      country: location.country,
      countryCode: location.countryCode,
      region: location.region,
      city: location.city,
      latitude: location.lat,
      longitude: location.lon,
      timezone: location.tz,
      isp: location.isp,
      isVPN,
      isProxy,
      isTor,
      riskScore,
    };

    // Cache result
    this.cache.set(ip, geo);
    return geo;
  }

  /** Check if an IP is allowed based on geo rules */
  async isAllowed(ip: string): Promise<{ allowed: boolean; reason: string }> {
    // Check explicit block
    if (this.blockedIPs.has(ip)) {
      return { allowed: false, reason: 'ip_blocked' };
    }

    const geo = await this.lookup(ip);

    // Country blocking
    if (this.config.enableBlocking) {
      if (this.config.blockedCountries.length > 0) {
        if (this.config.blockedCountries.includes(geo.countryCode)) {
          return { allowed: false, reason: `country_blocked:${geo.countryCode}` };
        }
      }

      if (this.config.allowedCountries.length > 0) {
        if (!this.config.allowedCountries.includes(geo.countryCode)) {
          return { allowed: false, reason: `country_not_allowed:${geo.countryCode}` };
        }
      }
    }

    // Risk threshold check
    if (geo.riskScore > this.config.riskThreshold) {
      return { allowed: false, reason: `high_risk:${geo.riskScore}` };
    }

    // VPN/Tor/Proxy blocking (if configured to block)
    if (geo.isTor && this.config.torDetection) {
      return { allowed: false, reason: 'tor_detected' };
    }

    return { allowed: true, reason: 'allowed' };
  }

  /** Detect if IP belongs to a known VPN provider */
  private detectVPN(ip: string): boolean {
    for (const prefix of VPN_PREFIXES) {
      if (ip.startsWith(prefix)) return true;
    }

    // Check port patterns and ASN characteristics
    const octets = ip.split('.').map(Number);
    // Heuristic: certain IP ranges commonly used by VPN providers
    if (octets[0] === 10 || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31)) {
      return false; // Private IPs are not VPNs
    }

    // Additional VPN detection based on IP characteristics
    const ipNum = (octets[0]! << 24) | (octets[1]! << 16) | (octets[2]! << 8) | octets[3]!;
    // Known VPN ranges (simulated)
    if (ipNum >= 0x68ee0000 && ipNum <= 0x68eeffff) return true; // 104.238.x.x

    return false;
  }

  /** Detect if IP is a known proxy/datacenter IP */
  private detectProxy(ip: string): boolean {
    for (const prefix of PROXY_PREFIXES) {
      if (ip.startsWith(prefix)) return true;
    }
    return false;
  }

  /** Detect if IP is a known Tor exit node */
  private detectTor(ip: string): boolean {
    for (const prefix of TOR_EXIT_PREFIXES) {
      if (ip.startsWith(prefix)) return true;
    }
    return false;
  }

  /** Calculate risk score for an IP */
  private calculateRiskScore(
    ip: string,
    isVPN: boolean,
    isProxy: boolean,
    isTor: boolean,
    countryCode: string,
  ): number {
    let score = 0;

    if (isTor) score += 40;
    if (isVPN) score += 20;
    if (isProxy) score += 30;

    // High-risk countries (simplified)
    const highRiskCountries = ['XX', 'A1', 'A2'];
    if (highRiskCountries.includes(countryCode)) score += 20;

    // Check if IP was previously blocked
    if (this.blockedIPs.has(ip)) score += 50;

    // Normalize to 0-100
    return Math.min(100, score);
  }

  /** Resolve IP to location data */
  private resolveLocation(ip: string): {
    country: string;
    countryCode: string;
    region: string;
    city: string;
    lat: number;
    lon: number;
    tz: string;
    isp: string;
  } {
    // Check database first
    const prefix = ip.split('.').slice(0, 2).join('.');
    const dbEntry = this.ipRangeDatabase.get(prefix);
    if (dbEntry) return dbEntry;

    // Simulate geolocation based on IP octets
    const octets = ip.split('.').map(Number);
    const firstOctet = octets[0] || 0;

    // Regional mapping based on first octet ranges (simplified)
    if (firstOctet >= 1 && firstOctet <= 50) {
      return {
        country: 'United States',
        countryCode: 'US',
        region: 'California',
        city: 'Los Angeles',
        lat: 34.0522,
        lon: -118.2437,
        tz: 'America/Los_Angeles',
        isp: 'Generic ISP',
      };
    } else if (firstOctet >= 51 && firstOctet <= 90) {
      return {
        country: 'United Kingdom',
        countryCode: 'GB',
        region: 'England',
        city: 'London',
        lat: 51.5074,
        lon: -0.1278,
        tz: 'Europe/London',
        isp: 'BT Group',
      };
    } else if (firstOctet >= 91 && firstOctet <= 120) {
      return {
        country: 'Germany',
        countryCode: 'DE',
        region: 'Bayern',
        city: 'Munich',
        lat: 48.1351,
        lon: 11.582,
        tz: 'Europe/Berlin',
        isp: 'Deutsche Telekom',
      };
    } else if (firstOctet >= 121 && firstOctet <= 150) {
      return {
        country: 'Japan',
        countryCode: 'JP',
        region: 'Tokyo',
        city: 'Tokyo',
        lat: 35.6762,
        lon: 139.6503,
        tz: 'Asia/Tokyo',
        isp: 'NTT',
      };
    } else if (firstOctet >= 151 && firstOctet <= 180) {
      return {
        country: 'India',
        countryCode: 'IN',
        region: 'Maharashtra',
        city: 'Mumbai',
        lat: 19.076,
        lon: 72.8777,
        tz: 'Asia/Kolkata',
        isp: 'Reliance Jio',
      };
    } else if (firstOctet >= 181 && firstOctet <= 210) {
      return {
        country: 'Brazil',
        countryCode: 'BR',
        region: 'Sao Paulo',
        city: 'Sao Paulo',
        lat: -23.5505,
        lon: -46.6333,
        tz: 'America/Sao_Paulo',
        isp: 'Telefonica',
      };
    } else {
      return {
        country: 'Australia',
        countryCode: 'AU',
        region: 'NSW',
        city: 'Sydney',
        lat: -33.8688,
        lon: 151.2093,
        tz: 'Australia/Sydney',
        isp: 'Telstra',
      };
    }
  }

  /** Initialize simulated IP database */
  private initializeDatabase(): void {
    // Populate common IP ranges
    this.ipRangeDatabase.set('8.8', {
      country: 'United States',
      countryCode: 'US',
      region: 'California',
      city: 'Mountain View',
      lat: 37.422,
      lon: -122.0841,
      tz: 'America/Los_Angeles',
      isp: 'Google LLC',
    });
    this.ipRangeDatabase.set('1.1', {
      country: 'Australia',
      countryCode: 'AU',
      region: 'NSW',
      city: 'Sydney',
      lat: -33.8688,
      lon: 151.2093,
      tz: 'Australia/Sydney',
      isp: 'Cloudflare',
    });
    this.ipRangeDatabase.set('208.67', {
      country: 'United States',
      countryCode: 'US',
      region: 'California',
      city: 'San Francisco',
      lat: 37.7749,
      lon: -122.4194,
      tz: 'America/Los_Angeles',
      isp: 'OpenDNS',
    });
    this.ipRangeDatabase.set('192.168', {
      country: 'Private',
      countryCode: 'XX',
      region: 'Local',
      city: 'Local',
      lat: 0,
      lon: 0,
      tz: 'UTC',
      isp: 'Private Network',
    });
    this.ipRangeDatabase.set('10.0', {
      country: 'Private',
      countryCode: 'XX',
      region: 'Local',
      city: 'Local',
      lat: 0,
      lon: 0,
      tz: 'UTC',
      isp: 'Private Network',
    });
    this.ipRangeDatabase.set('172.16', {
      country: 'Private',
      countryCode: 'XX',
      region: 'Local',
      city: 'Local',
      lat: 0,
      lon: 0,
      tz: 'UTC',
      isp: 'Private Network',
    });
  }

  /** Block an IP address */
  blockIP(ip: string): void {
    this.blockedIPs.add(ip);
    this.cache.delete(ip);
  }

  /** Unblock an IP address */
  unblockIP(ip: string): void {
    this.blockedIPs.delete(ip);
    this.cache.delete(ip);
  }

  /** Update blocked countries */
  setBlockedCountries(countries: string[]): void {
    this.config.blockedCountries = countries;
  }

  /** Update allowed countries */
  setAllowedCountries(countries: string[]): void {
    this.config.allowedCountries = countries;
  }

  /** Clear cache */
  clearCache(): void {
    this.cache.clear();
  }

  /** Get statistics */
  getStats(): { lookups: number; cacheSize: number; blockedIPs: number } {
    return {
      lookups: this.lookupCount,
      cacheSize: this.cache.size,
      blockedIPs: this.blockedIPs.size,
    };
  }
}
