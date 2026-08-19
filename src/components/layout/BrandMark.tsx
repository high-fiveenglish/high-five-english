const SHIELD_PATH =
  "M14 2 L86 2 Q92 2 92 8 L92 60 C92 80 74 94 50 104 C26 94 8 80 8 60 L8 8 Q8 2 14 2 Z";

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 1.08}
      viewBox="0 0 100 108"
      className="shrink-0"
      role="img"
      aria-label="하이파이브 잉글리쉬 로고"
    >
      <path d={SHIELD_PATH} fill="#F8721A" />
      <text
        x="50"
        y="38"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight={800}
        fontSize="13"
        letterSpacing="0.5"
        fill="#ACE3E6"
      >
        HIGH-FIVE
      </text>
      <text
        x="50"
        y="58"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight={800}
        fontSize="17"
        letterSpacing="0.3"
        fill="#ACE3E6"
      >
        ENGLISH
      </text>
    </svg>
  );
}
