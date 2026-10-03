// 수업 녹음 파일의 "임시 저장소" 역할을 추상화하는 최소 인터페이스. 지금은 구현체가
// 없다(Google Workspace/Shared Drive가 아직 준비되지 않아 GoogleDriveStorage는 만들지
// 않음 — READ-ONLY 조사로 이미 확인된 차단 사유, 조사 결과는 세션 기록 참고). 나중에
// Drive가 준비되면 이 인터페이스를 구현하는 GoogleDriveStorage 하나만 추가하면 되고,
// 그 전까지 webhook/AI 처리 코드(assemblyai.ts, aiEvaluation.ts)는 이 인터페이스에만
// 의존해 Drive 유무와 무관하게 개발/테스트할 수 있다. 큰 추상화 프레임워크가 아니라
// 딱 이 3개 동작만 분리한다.
export interface RecordingStorage {
  /** 파일을 업로드하고, 저장소가 발급한 파일 식별자를 반환한다. */
  upload(params: { fileName: string; contentType: string; fileSize: number }): Promise<{ fileId: string }>;
  /** 파일을 영구 삭제한다(처리 완료 후 원본을 장기 보관하지 않기 위함). */
  delete(fileId: string): Promise<void>;
  /** AssemblyAI 등 외부 서비스가 직접 접근할 수 있는, 짧게만 유효한 다운로드 URL을 발급한다. */
  getDownloadUrl(fileId: string): Promise<string>;
}
