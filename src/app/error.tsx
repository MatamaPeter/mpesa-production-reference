"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="shell section empty-state">
      <h1>A connection hiccup.</h1>
      <p>We couldn’t load this page. Please try again in a moment.</p>
      <button className="button dark" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
