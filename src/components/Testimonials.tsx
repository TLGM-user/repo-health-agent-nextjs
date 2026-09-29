const testimonials = [
  {
    quote: "GitFlow caught a critical dependency vulnerability two weeks before it would have hit production. Paid for itself immediately.",
    name: "Sarah Chen",
    role: "CTO, FastScale",
  },
  {
    quote: "We went from 40% test coverage to 75% in three months. The automated PRs make it effortless.",
    name: "Marcus Johnson",
    role: "VP Engineering, DataFlow",
  },
  {
    quote: "The security scanning alone is worth the subscription. We caught 12 secret leaks in the first week.",
    name: "Emily Rodriguez",
    role: "DevOps Lead, CloudNine",
  },
];

export function Testimonials() {
  return (
    <section id="testimonials" className="mx-auto max-w-6xl px-6 py-20">
      <div className="mb-12 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
          Testimonials
        </p>
        <h2 className="mt-3 text-3xl font-bold text-white">
          Trusted by engineering teams
        </h2>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {testimonials.map((t) => (
          <div
            key={t.name}
            className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
          >
            <p className="text-sm leading-6 text-slate-300">
              &ldquo;{t.quote}&rdquo;
            </p>
            <div className="mt-4">
              <p className="text-sm font-semibold text-white">{t.name}</p>
              <p className="text-xs text-slate-400">{t.role}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
