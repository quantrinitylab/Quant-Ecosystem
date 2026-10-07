import { FestivalEvent, QuantLanguage } from '../types.js';

const FESTIVALS: FestivalEvent[] = [
  {
    name: 'Diwali',
    date: '11-01',
    languages: [QuantLanguage.hindi, QuantLanguage.marathi, QuantLanguage.gujarati],
    states: ['UP', 'Maharashtra', 'Gujarat', 'Rajasthan'],
    greetings: { hindi: 'Shubh Deepawali', english: 'Happy Diwali' },
  },
  {
    name: 'Holi',
    date: '03-25',
    languages: [QuantLanguage.hindi, QuantLanguage.bengali],
    states: ['UP', 'Bihar', 'Rajasthan'],
    greetings: { hindi: 'Holi ki Shubhkamnayein', english: 'Happy Holi' },
  },
  {
    name: 'Eid',
    date: '04-11',
    languages: [QuantLanguage.hindi, QuantLanguage.english],
    states: ['UP', 'Kerala', 'West Bengal'],
    greetings: { hindi: 'Eid Mubarak', english: 'Eid Mubarak' },
  },
  {
    name: 'Christmas',
    date: '12-25',
    languages: [QuantLanguage.english, QuantLanguage.malayalam],
    states: ['Kerala', 'Goa', 'Tamil Nadu'],
    greetings: { english: 'Merry Christmas', hindi: 'Krismas ki Shubhkamnayein' },
  },
  {
    name: 'Pongal',
    date: '01-15',
    languages: [QuantLanguage.tamil],
    states: ['Tamil Nadu'],
    greetings: { tamil: 'Pongalo Pongal', english: 'Happy Pongal' },
  },
  {
    name: 'Onam',
    date: '09-15',
    languages: [QuantLanguage.malayalam],
    states: ['Kerala'],
    greetings: { malayalam: 'Onashamsakal', english: 'Happy Onam' },
  },
  {
    name: 'Baisakhi',
    date: '04-13',
    languages: [QuantLanguage.punjabi],
    states: ['Punjab', 'Haryana'],
    greetings: { punjabi: 'Baisakhi di Lakh Lakh Vadhaiyaan', english: 'Happy Baisakhi' },
  },
  {
    name: 'Durga Puja',
    date: '10-12',
    languages: [QuantLanguage.bengali],
    states: ['West Bengal', 'Assam'],
    greetings: { bengali: 'Shubho Bijoya', english: 'Happy Durga Puja' },
  },
  {
    name: 'Ganesh Chaturthi',
    date: '09-07',
    languages: [QuantLanguage.marathi, QuantLanguage.kannada],
    states: ['Maharashtra', 'Karnataka'],
    greetings: { marathi: 'Ganpati Bappa Morya', english: 'Happy Ganesh Chaturthi' },
  },
  {
    name: 'Navratri',
    date: '10-03',
    languages: [QuantLanguage.gujarati, QuantLanguage.hindi],
    states: ['Gujarat', 'Rajasthan', 'MP'],
    greetings: { gujarati: 'Navratri ni Shubhkamnao', english: 'Happy Navratri' },
  },
  {
    name: 'Raksha Bandhan',
    date: '08-19',
    languages: [QuantLanguage.hindi, QuantLanguage.marathi],
    states: ['UP', 'Maharashtra', 'Rajasthan'],
    greetings: { hindi: 'Rakhi ki Shubhkamnayein', english: 'Happy Raksha Bandhan' },
  },
  {
    name: 'Independence Day',
    date: '08-15',
    languages: [QuantLanguage.hindi, QuantLanguage.english],
    states: ['All'],
    greetings: { hindi: 'Swatantrata Diwas ki Shubhkamnayein', english: 'Happy Independence Day' },
  },
];

export class FestivalCalendar {
  private festivals: FestivalEvent[] = FESTIVALS;

  getFestivals(month?: number, state?: string): FestivalEvent[] {
    return this.festivals.filter((f) => {
      if (month !== undefined) {
        const parts = f.date.split('-');
        const fMonth = parseInt(parts[0]!, 10);
        if (fMonth !== month) return false;
      }
      if (state !== undefined) {
        if (!f.states.includes(state)) return false;
      }
      return true;
    });
  }

  getUpcoming(days: number): FestivalEvent[] {
    const now = new Date();
    const year = now.getFullYear();
    const end = new Date(now.getTime() + days * 86400000);
    return this.festivals.filter((f) => {
      const fDate = new Date(`${year}-${f.date}`);
      return fDate >= now && fDate <= end;
    });
  }

  getGreeting(festivalName: string, language: QuantLanguage): string {
    const festival = this.festivals.find(
      (f) => f.name.toLowerCase() === festivalName.toLowerCase(),
    );
    if (!festival) return '';
    return festival.greetings[language] ?? festival.greetings['english'] ?? '';
  }
}
