import type { VoiceCommand } from '../types.js';
// prettier-ignore
const CATS = ['communication','time','media','navigation','info','device','home','shopping','productivity','crisis'];
// prettier-ignore
const DATA = [
  'call mom,send text,read messages,video call,check voicemail,send email,reply message,forward call,block caller,add contact',
  'set alarm,set timer,what time,show calendar,add event,snooze alarm,countdown,world clock,schedule meeting,remind me',
  'play music,pause,next song,volume up,volume down,play podcast,shuffle,repeat,play playlist,stop music',
  'go home,navigate work,nearest gas,traffic update,share location,find parking,avoid tolls,walking directions,save place,eta',
  'weather today,latest news,stock price,define word,translate,sports score,wiki search,exchange rate,horoscope,trivia',
  'take photo,flashlight on,battery level,bluetooth on,wifi off,screenshot,dark mode,airplane mode,restart phone,lock screen',
  'lights on,lights off,thermostat up,lock door,garage open,fan on,tv off,arm security,camera feed,vacuum start',
  'add to cart,reorder milk,track package,find coupon,compare prices,buy groceries,order food,pay bill,check balance,return item',
  'new note,read emails,set focus,start meeting,share screen,create task,open calendar,dictate text,search files,end meeting',
  'call 911,emergency sos,find hospital,call poison control,send location,alert contacts,first aid,roadside help,fire report,amber alert',
];
// prettier-ignore
const CMDS: VoiceCommand[] = DATA.flatMap((g, i) => g.split(',').map((phrase, j) => ({ id: `cmd-${i}-${j}`, phrase, category: CATS[i]!, handler: `handle_${CATS[i]}` })));
export class CommandRegistry {
  // prettier-ignore
  getAll() { return CMDS; }
  // prettier-ignore
  getByCategory(cat: string) { return CMDS.filter((c) => c.category === cat); }
  // prettier-ignore
  getCoverage() { return { total: CMDS.length, categories: new Set(CMDS.map((c) => c.category)).size }; }
  // prettier-ignore
  execute(phrase: string) { return CMDS.find((c) => c.phrase === phrase)?.id ?? null; }
}
