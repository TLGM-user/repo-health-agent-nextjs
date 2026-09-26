export type FeatureCardProps = {
  title: string;
  description: string;
  icon: string;
};

export function FeatureCard({ title, description, icon }: FeatureCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:shadow-slate-900/30">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-xl dark:bg-indigo-500/20 dark:text-indigo-200">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{description}</p>
    </article>
  );
}
