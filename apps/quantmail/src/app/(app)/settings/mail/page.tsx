import { redirect } from 'next/navigation';

// /settings/mail previously returned a 404. Mail preferences live inside the
// main settings page, so permanently send visitors there.
export default function SettingsMailRedirect() {
  redirect('/settings');
}
