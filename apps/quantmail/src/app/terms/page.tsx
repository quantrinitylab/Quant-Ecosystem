import Link from 'next/link';

export const metadata = { title: 'Terms of Service · QuantMail' };

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: 'Your account',
    body: 'Your QuantMail address is yours. You are responsible for keeping your password and recovery details private, and for activity under your account.',
  },
  {
    heading: 'Acceptable use',
    body: 'Do not use QuantMail to send spam, phishing, or unlawful content, or to interfere with the service or other users. We may suspend accounts that do.',
  },
  {
    heading: 'Your data',
    body: 'Your mail is end-to-end encrypted where indicated. We do not sell your personal data. See the Privacy Policy for what we collect and why.',
  },
  {
    heading: 'Changes',
    body: 'We may update these terms as the service evolves. Continued use of QuantMail after a change means you accept the updated terms.',
  },
];

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-16 text-zinc-300">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF8C42]">
        Legal
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
        Terms of Service
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-500">
        The short, plain version of the rules for using QuantMail.
      </p>
      <div className="mt-8 space-y-6">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="text-sm font-semibold text-white">{section.heading}</h2>
            <p className="mt-1.5 text-sm leading-6 text-zinc-400">{section.body}</p>
          </section>
        ))}
      </div>
      <p className="mt-10 text-sm">
        <Link href="/login" className="font-semibold text-[#FF8C42] underline-offset-4 hover:underline">
          Return to sign in
        </Link>
      </p>
    </main>
  );
}
