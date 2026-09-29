interface CTAProps {
  title: string;
  subtitle: string;
  href: string;
  cta: string;
}

export function CTA({ title, subtitle, href, cta }: CTAProps) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-col items-center justify-between gap-6 rounded-3xl border border-slate-800 bg-slate-900 p-8 md:flex-row md:p-12">
        <div>
          <h3 className="text-2xl font-bold text-white">{title}</h3>
          <p className="mt-2 text-slate-400">{subtitle}</p>
        </div>
        <a
          href={href}
          className="rounded-full bg-indigo-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-indigo-400"
        >
          {cta}
        </a>
      </div>
    </section>
  );
}
