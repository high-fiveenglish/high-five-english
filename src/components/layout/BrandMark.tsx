import { useTenant } from "../../context/TenantContext";

const SHIELD_PATH =
  "M14 2 L86 2 Q92 2 92 8 L92 60 C92 80 74 94 50 104 C26 94 8 80 8 60 L8 8 Q8 2 14 2 Z";

export function BrandMark({ size = 40 }: { size?: number }) {
  const { logoUrl, name, isHeadquarters } = useTenant();

  // 협력사가 자체 로고를 올려뒀으면(logoUrl) 그 이미지를 그대로 쓰고, 없으면(본사,
  // 또는 아직 로고를 안 올린 협력사) 기존 방패 모양 마크를 그대로 보여준다.
  if (logoUrl) {
    return (
      // eslint-disable-next-line jsx-a11y/alt-text -- alt는 아래에서 동적으로 전달됨
      <img src={logoUrl} alt={name} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    );
  }

  // 로고를 아직 안 올린 협력사에는 본사 방패 마크(HIGH-FIVE ENGLISH 텍스트 포함)를
  // 보여주면 안 되므로, 협력사 이니셜을 넣은 중립적인 원형 마크로 대체한다.
  if (!isHeadquarters) {
    return (
      <span
        role="img"
        aria-label={`${name} 로고`}
        className="flex shrink-0 items-center justify-center rounded-full bg-brand-600 font-extrabold text-white"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {name.slice(0, 1)}
      </span>
    );
  }

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
