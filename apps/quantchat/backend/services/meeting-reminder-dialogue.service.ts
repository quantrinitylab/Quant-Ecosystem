export type DialogueLocale = 'en' | 'hi' | 'hinglish';

export interface MeetingReminderContext {
  meetingId: string;
  title: string;
  organizer: string;
  startTime: string | Date;
  minutesUntilStart: number;
  joinUrl?: string;
  userName?: string;
  locale?: DialogueLocale;
}

export type DialogueIntent = 'JOIN_NOW' | 'RUNNING_LATE' | 'SNOOZE' | 'DECLINE' | 'UNKNOWN';

export interface DialogueTurnResult {
  speechText: string;
  intent: DialogueIntent;
  actionRequired?:
    | 'CONNECT_MEETING'
    | 'SEND_LATE_NOTICE'
    | 'SNOOZE_ALERT'
    | 'CANCEL_ATTENDANCE'
    | 'NONE';
  /**
   * QC-F-070: whether any code actually executed `actionRequired`.
   *
   * This dialogue service only *requests* an action — nothing in the
   * backend executes SEND_LATE_NOTICE (no organizer notification path),
   * CANCEL_ATTENDANCE (no calendar write path), SNOOZE_ALERT (no re-queue
   * producer) or CONNECT_MEETING (no client consumes the request), and the
   * sole consumer of `actionRequired` (routes/voice-bot.ts) echoes it in
   * the HTTP response. This flag is therefore always `false` here, and the
   * speech text says so honestly. A future executor must perform the real
   * action first and only then produce a result with `actionExecuted:
   * true` — never claim completion in speech for an unexecuted action.
   */
  actionExecuted: boolean;
  actionPayload?: Record<string, unknown>;
  shouldEndCall: boolean;
  state: 'INITIAL' | 'AWAITING_ACTION' | 'RESOLVED';
}

export class MeetingReminderDialogueService {
  /**
   * Generates the opening spoken reminder prompt based on meeting context and locale.
   */
  generateOpeningGreeting(context: MeetingReminderContext): string {
    const locale = context.locale || 'hinglish';
    const name = context.userName ? context.userName.trim() : '';
    const mins = Math.max(1, Math.round(context.minutesUntilStart));

    if (locale === 'hinglish') {
      const salutation = name ? `Namaste ${name}!` : 'Namaste!';
      return `${salutation} Aapki agle ${mins} minute mein '${context.title}' meeting shuru hone wali hai with ${context.organizer}. Kya main aapko meeting room mein connect karu, ya ${context.organizer} aur team ko inform karu ki aap thoda late honge?`;
    }

    if (locale === 'hi') {
      const salutation = name ? `नमस्ते ${name} जी!` : 'नमस्ते!';
      return `${salutation} आपकी ${mins} मिनट में '${context.title}' मीटिंग ${context.organizer} के साथ शुरू होने वाली है। क्या आप मीटिंग में जुड़ना चाहते हैं?`;
    }

    // Default English
    const salutation = name ? `Namaste ${name}!` : 'Namaste!';
    return `${salutation} You have a meeting in ${mins} minutes: '${context.title}' with ${context.organizer}. Would you like me to connect you to the meeting room now, or let them know you're running late?`;
  }

  /**
   * Classifies user voice input into actionable intents.
   */
  classifyIntent(userUtterance: string): DialogueIntent {
    const text = userUtterance.toLowerCase().trim();

    // Running late matches
    if (
      /\b(late|delay|inform)\b/i.test(text) ||
      text.includes('thoda time') ||
      text.includes('5 min') ||
      text.includes('10 min') ||
      text.includes('running late') ||
      text.includes('tell them')
    ) {
      return 'RUNNING_LATE';
    }

    // Join now matches
    if (/\b(join|connect|yes|sure|start|ha|haan|kardo|chalo|open)\b/i.test(text)) {
      return 'JOIN_NOW';
    }

    // Snooze matches
    if (
      /\b(snooze|wait|later|ruk)\b/i.test(text) ||
      text.includes('baad me') ||
      text.includes('remind me')
    ) {
      return 'SNOOZE';
    }

    // Decline / cancel matches
    if (/\b(decline|cancel|cannot|busy|skip|reject|nahi)\b/i.test(text) || text.includes("can't")) {
      return 'DECLINE';
    }

    return 'UNKNOWN';
  }

  /**
   * Evaluates the conversational turn and determines the next spoken dialogue and ecosystem action.
   */
  handleUserResponse(userUtterance: string, context: MeetingReminderContext): DialogueTurnResult {
    const intent = this.classifyIntent(userUtterance);
    const locale = context.locale || 'hinglish';

    switch (intent) {
      case 'JOIN_NOW': {
        // QC-F-070: nothing performs the redirect/connect — the request is
        // handed to the caller via actionRequired/actionPayload. Speech
        // must not claim the connect already happened; the join link in
        // the payload is the real, usable artefact.
        const speechText =
          locale === 'hinglish'
            ? `Bilkul! Meeting room mein judne ke liye join link taiyaar hai. Have a great meeting!`
            : `Sure! Your join link for '${context.title}' is ready — use it to enter the meeting room. Have a productive meeting!`;
        return {
          speechText,
          intent,
          actionRequired: 'CONNECT_MEETING',
          actionExecuted: false,
          actionPayload: {
            meetingId: context.meetingId,
            joinUrl: context.joinUrl || `/meetings/join/${context.meetingId}`,
          },
          shouldEndCall: true,
          state: 'RESOLVED',
        };
      }

      case 'RUNNING_LATE': {
        const lateMinutes = this.extractLateMinutes(userUtterance) || 5;
        // QC-F-070: no code sends this notice (no executor exists), so the
        // bot must not say it was sent. State the real situation and tell
        // the user what they need to do themselves.
        const speechText =
          locale === 'hinglish'
            ? `Samajh gaya, aap lagbhag ${lateMinutes} minute late honge. Sach ye hai ki main is call se ${context.organizer} ko notice nahi bhej sakta — kripya khud ek message karke inform kar dein.`
            : `Got it — you will be about ${lateMinutes} minutes late. To be clear, I cannot send a notice to ${context.organizer} from this call — please message them directly so they know.`;
        return {
          speechText,
          intent,
          actionRequired: 'SEND_LATE_NOTICE',
          actionExecuted: false,
          actionPayload: {
            meetingId: context.meetingId,
            organizer: context.organizer,
            lateMinutes,
            message: `Hi ${context.organizer}, I am running about ${lateMinutes} minutes late for our meeting. Will join shortly!`,
          },
          shouldEndCall: true,
          state: 'RESOLVED',
        };
      }

      case 'SNOOZE': {
        // QC-F-070: nothing re-queues a follow-up alert (the proactive-jobs
        // producer is not in this repo), so the bot must not promise to
        // ring again. Say plainly that no follow-up alert will come.
        const speechText =
          locale === 'hinglish'
            ? `Samajh gaya. Sach ye hai ki dobara alert ki suvidha is call se uplabdh nahi hai — main aapko dobara call nahi karunga. Bye!`
            : `Got it. To be clear, I cannot schedule a follow-up alert from this call, so I will not ring you again. Goodbye!`;
        return {
          speechText,
          intent,
          actionRequired: 'SNOOZE_ALERT',
          actionExecuted: false,
          actionPayload: {
            meetingId: context.meetingId,
            snoozeSeconds: 120,
          },
          shouldEndCall: true,
          state: 'RESOLVED',
        };
      }

      case 'DECLINE': {
        // QC-F-070: there is no calendar write path in this backend, so
        // nothing was marked declined. Say so, and tell the user the step
        // they still need to take themselves.
        const speechText =
          locale === 'hinglish'
            ? `Samajh gaya. Sach ye hai ki main is call se aapke calendar par decline mark nahi kar sakta — kripya calendar mein khud decline kar dein, taaki ${context.organizer} ko pata chal jaye.`
            : `Got it. To be clear, I cannot update your calendar from this call — please decline the meeting in your calendar so ${context.organizer} knows.`;
        return {
          speechText,
          intent,
          actionRequired: 'CANCEL_ATTENDANCE',
          actionExecuted: false,
          actionPayload: {
            meetingId: context.meetingId,
          },
          shouldEndCall: true,
          state: 'RESOLVED',
        };
      }

      case 'UNKNOWN':
      default: {
        const speechText =
          locale === 'hinglish'
            ? `Maaf kijiye, main theek se samajh nahi paaya. Kya aap meeting mein join karna chahte hain, ya late ka notice bheju?`
            : `I didn't quite catch that. Would you like to join the meeting now, or should I notify the organizer that you're running late?`;
        return {
          speechText,
          intent,
          actionRequired: 'NONE',
          actionExecuted: false,
          shouldEndCall: false,
          state: 'AWAITING_ACTION',
        };
      }
    }
  }

  private extractLateMinutes(text: string): number | null {
    const match = text.match(/(\d+)\s*(?:min|minute)/i);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 60) {
        return parsed;
      }
    }
    return null;
  }
}
