import Link from 'next/link';

export const metadata = { title: 'Help · QuantMail' };

const TOPICS: Array<{ heading: string; body: string }> = [
  {
    heading: 'I forgot my email address',
    body: 'On the sign-in page, choose "Forgot email?" and enter the mobile number linked to your account. If it matches, we will send your address to that number.',
  },
  {
    heading: 'I forgot my password',
    body: 'On the sign-in page, choose "Forgot password?" and enter your full QuantMail address. Reset instructions will be sent if the address is eligible.',
  },
  {
    heading: 'Create an address',
    body: 'New to QuantMail? Choose "Create an address" on the sign-in page and follow the steps to claim your address.',
  },
  {
    heading: 'Something else is wrong',
    body: 'If the app shows an error while loading, wait a moment and retry. If it persists, note what you were doing and the time it happened before contacting support.',
  },
];

export default function HelpPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-16 text-zinc-300">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FF8C42]">
        Support
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
        Help
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-500">
        Answers to the most common sign-in questions.
      </p>
      <div className="mt-8 space-y-6">
        {TOPICS.map((topic) => (
          <section key={topic.heading}>
            <h2 className="text-sm font-semibold text-white">{topic.heading}</h2>
            <p className="mt-1.5 text-sm leading-6 text-zinc-400">{topic.body}</p>
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
