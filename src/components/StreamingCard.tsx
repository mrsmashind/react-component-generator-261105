import { CodeView } from './CodeView';

interface StreamingCardProps {
  code: string;
}

/** 생성 중인 코드를 실시간으로 보여주는 카드. 완료되면 미리보기 탭이 선택된 ComponentCard로 대체된다. */
export function StreamingCard({ code }: StreamingCardProps) {
  return (
    <div className="window component-card" role="status" aria-label="코드 생성 중">
      <div className="titlebar">
        <h2>생성 중</h2>
      </div>
      <div className="card-tabs" role="tablist">
        <button role="tab" aria-selected={false} className="tab" disabled>
          미리보기
        </button>
        <button role="tab" aria-selected={true} className="tab tab--active">
          코드
        </button>
      </div>
      <div className="card-content">
        <CodeView code={code} />
      </div>
      <div className="progress" aria-hidden="true" />
    </div>
  );
}
