import { Link } from "react-router-dom";
import { MessageCircle, Clock, Landmark, Globe } from "lucide-react";
import { NAV_ITEMS } from "../../data/nav";
import { Container } from "../ui/Container";
import { CONTACT } from "../../data/contact";
import { BrandMark } from "./BrandMark";

export function Footer({ onOpenContact }: { onOpenContact: () => void }) {
  return (
    <footer className="border-t border-brand-900/10 bg-brand-950 text-white/70">
      <Container className="py-14">
        <div className="flex flex-col items-center text-center">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark size={38} />
            <span className="text-xl font-extrabold tracking-tight text-white">
              하이파이브 잉글리쉬
            </span>
          </Link>
          <p className="mt-2 text-xs tracking-wide text-white/40">
            HIGH FIVE ENGLISH
          </p>
        </div>

        <nav className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 border-y border-white/10 py-6 text-sm">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.label}
              href={item.href ?? item.children?.[0]?.href ?? "#"}
              className="font-medium text-white/70 transition hover:text-white"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="mt-10 grid gap-10 md:grid-cols-3">
          <div>
            <h4 className="mb-3 text-sm font-bold text-white">회사 정보</h4>
            <dl className="space-y-1.5 text-[13px] leading-relaxed text-white/55">
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-white/35">상호</dt>
                <dd>하이파이브 잉글리쉬</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-white/35">대표자</dt>
                <dd>우종범</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-white/35">사업자등록번호</dt>
                <dd>000-00-00000</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 text-white/35">주소</dt>
                <dd>서울특별시 OO구 OO로 00, 0층</dd>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <Globe size={13} className="shrink-0 text-accent-400" />
                <dd className="font-medium text-white/70">{CONTACT.website}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-bold text-white">고객센터</h4>
            <ul className="space-y-2 text-[13px] text-white/55">
              <li>
                <button
                  onClick={onOpenContact}
                  className="flex items-center gap-2 text-left transition hover:text-white"
                >
                  <MessageCircle size={14} className="shrink-0 text-accent-400" />
                  <span>
                    카카오톡{" "}
                    <span className="font-semibold text-white/80">
                      {CONTACT.kakaoId}
                    </span>
                  </span>
                </button>
              </li>
              <li>
                <button
                  onClick={onOpenContact}
                  className="flex items-center gap-2 text-left transition hover:text-white"
                >
                  <MessageCircle size={14} className="shrink-0 text-accent-400" />
                  <span>
                    WeChat{" "}
                    <span className="font-semibold text-white/80">
                      {CONTACT.wechatId}
                    </span>
                  </span>
                </button>
              </li>
              <li className="flex items-center gap-2">
                <Clock size={14} className="shrink-0 text-accent-400" />
                <span>평일 09:00 – 18:00 (주말·공휴일 휴무)</span>
              </li>
            </ul>
            <Link
              to="/counsel"
              className="mt-4 inline-block rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
            >
              1:1 상담 문의하기
            </Link>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-bold text-white">무통장입금 계좌 안내</h4>
            <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-[13px] leading-relaxed text-white/70">
              <Landmark size={16} className="mt-0.5 shrink-0 text-accent-400" />
              <div>
                <p className="font-bold text-white">
                  {CONTACT.bank.bankName} {CONTACT.bank.accountNumber}
                </p>
                <p className="mt-0.5 text-white/50">
                  예금주 {CONTACT.bank.accountHolder}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-2 border-t border-white/10 pt-6 text-center text-[12px] text-white/35 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} HiFive English. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-white/60">
              이용약관
            </a>
            <a href="#" className="hover:text-white/60">
              개인정보처리방침
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
}
