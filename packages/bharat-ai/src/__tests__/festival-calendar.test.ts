import { FestivalCalendar } from '../culture/festival-calendar.js';
import { QuantLanguage } from '../types.js';

describe('FestivalCalendar', () => {
  let calendar: FestivalCalendar;

  beforeEach(() => {
    calendar = new FestivalCalendar();
  });

  it('should return festivals for a given month', () => {
    const festivals = calendar.getFestivals(11);
    expect(festivals.length).toBeGreaterThan(0);
    expect(festivals.some((f) => f.name === 'Diwali')).toBe(true);
  });

  it('should return festivals for a given state', () => {
    const festivals = calendar.getFestivals(undefined, 'Kerala');
    expect(festivals.length).toBeGreaterThan(0);
    expect(festivals.some((f) => f.name === 'Onam')).toBe(true);
  });

  it('should filter by both month and state', () => {
    const festivals = calendar.getFestivals(9, 'Kerala');
    expect(festivals.some((f) => f.name === 'Onam')).toBe(true);
  });

  it('should return all festivals when no filter', () => {
    const festivals = calendar.getFestivals();
    expect(festivals.length).toBeGreaterThanOrEqual(12);
  });

  it('should get greeting for a festival in a language', () => {
    const greeting = calendar.getGreeting('Diwali', QuantLanguage.hindi);
    expect(greeting).toBe('Shubh Deepawali');
  });

  it('should fallback to english greeting if language not found', () => {
    const greeting = calendar.getGreeting('Diwali', QuantLanguage.tamil);
    expect(greeting).toBe('Happy Diwali');
  });

  it('should return empty string for unknown festival', () => {
    const greeting = calendar.getGreeting('UnknownFest', QuantLanguage.hindi);
    expect(greeting).toBe('');
  });

  it('should include at least 12 festivals total', () => {
    const all = calendar.getFestivals();
    expect(all.length).toBeGreaterThanOrEqual(12);
  });
});
