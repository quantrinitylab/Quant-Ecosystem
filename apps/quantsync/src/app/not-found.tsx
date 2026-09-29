import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090A0C] p-6 text-white">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">404 - Page Not Found</h1>
        <p className="text-gray-400 mb-6">
          The page you are looking for does not exist on QuantWave.
        </p>
        <Link
          href="/"
          className="rounded-lg bg-[#FF8C42] px-4 py-2 text-sm font-semibold text-white"
        >
          Return Home
        </Link>
      </div>
    </main>
  );
}
