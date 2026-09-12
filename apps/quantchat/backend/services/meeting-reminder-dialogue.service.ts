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
      return `${salutation} Aapki agle ${mins} minute mein '${context.title}' meeting shuru hone wali hai with ${context.organizer}. Kya main aapko meeting room mein connect karu, ya Raj aur team ko inform karu ki aap thoda late honge?`;
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
        const speechText =
          locale === 'hinglish'
            ? `Bilkul! Main aapko meeting room mein redirect kar raha hoon. Have a great meeting!`
            : `Connecting you to '${context.title}' now. Have a productive meeting!`;
        return {
          speechText,
          intent,
          actionRequired: 'CONNECT_MEETING',
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
        const speechText =
          locale === 'hinglish'
            ? `Maine ${context.organizer} ko note bhej diya hai ki aap lagbhag ${lateMinutes} minute late honge. Tension mat lijiye!`
            : `Understood! I have notified ${context.organizer} that you will be joining approximately ${lateMinutes} minutes late.`;
        return {
          speechText,
          intent,
          actionRequired: 'SEND_LATE_NOTICE',
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
        const speechText =
          locale === 'hinglish'
            ? `Thik hai, main 2 minute baad aapko dobara alert karunga. Bye!`
            : `No problem, I will ring you again in 2 minutes. Goodbye!`;
        return {
          speechText,
          intent,
          actionRequired: 'SNOOZE_ALERT',
          actionPayload: {
            meetingId: context.meetingId,
            snoozeSeconds: 120,
          },
          shouldEndCall: true,
          state: 'RESOLVED',
        };
      }

      case 'DECLINE': {
        const speechText =
          locale === 'hinglish'
            ? `Got it. Maine aapke calendar par status decline mark kar diya hai.`
            : `Understood. I have updated your calendar status to declined for this meeting.`;
        return {
          speechText,
          intent,
          actionRequired: 'CANCEL_ATTENDANCE',
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
