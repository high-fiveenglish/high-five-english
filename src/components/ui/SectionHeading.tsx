export function SectionHeading({
  eyebrow,
  title,
  description,
  light = false,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  light?: boolean;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "text-center" : "text-left"}>
      {eyebrow && (
        <span
          className={`inline-block rounded-full px-3.5 py-1 text-xs font-semibold tracking-wide ${
            light
              ? "bg-white/10 text-accent-300"
              : "bg-accent-50 text-accent-600"
          }`}
        >
          {eyebrow}
        </span>
      )}
      <h2
        className={`mt-4 text-2xl font-bold sm:text-3xl md:text-[2.25rem] ${
          light ? "text-white" : "text-brand-950"
        }`}
      >
        {title}
      </h2>
      {description && (
        <p
          className={`mx-auto mt-4 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed sm:text-base ${
            align === "left" ? "mx-0" : ""
          } ${light ? "text-white/70" : "text-slate-500"}`}
        >
          {description}
        </p>
      )}
    </div>
  );
}
