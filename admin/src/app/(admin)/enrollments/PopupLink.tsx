"use client";

// 수업관리/재수강 둘 다 목록 화면을 벗어나지 않도록 새 탭 이동이 아니라 별도 팝업 창으로
// 띄운다. 크롬 등 브라우저는 처음 방문하는 사이트의 팝업을 기본적으로 차단해두므로,
// window.open이 null을 반환하면(차단됨) "눌러도 아무 반응 없음"으로 끝나지 않도록 팝업
// 차단 아이콘을 허용해달라는 안내를 바로 보여준다.
export function PopupLink({
  href,
  windowName,
  className,
  children,
}: {
  href: string;
  windowName: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        const popup = window.open(href, windowName, "width=1100,height=800,noopener");
        if (!popup) {
          alert(
            "팝업이 브라우저에 의해 차단되었습니다. 주소창 오른쪽의 팝업 차단 아이콘을 눌러 이 사이트의 팝업을 허용한 뒤 다시 시도해주세요.",
          );
        }
      }}
      className={className}
    >
      {children}
    </button>
  );
}
