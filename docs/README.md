# RISK-ZERO 문서 인덱스

## 현재 주제 기준

- [하드웨어 아키텍처 — 2026-08-28](RISK-ZERO_하드웨어_아키텍처_2026-08-28.md)
- [Door Hub 소프트웨어 설계 — 2026-08-28](RISK-ZERO_Door_Hub_소프트웨어_설계_2026-08-28.md)
- [새 PC·Codex 인수인계 — 2026-08-28](CODEX_HANDOFF.md)
- [외부 DVP Camera 구동 순서](../fpga/arty-a7-100t/DIRECT_CAMERA_BRINGUP.md)
- [FPGA Default-deny Safety Gate FSM 설계 v0.1](RISK-ZERO_FPGA_Safety_Gate_FSM_설계_v0.1.md)
- [시청각 발화 검증 시스템 주제 정의서 v0.1](RISK-ZERO_시청각_발화_검증_주제_정의서_v0.1.md)
- [시청각 검증 공격 시나리오 v0.1](RISK-ZERO_시청각_검증_공격_시나리오_v0.1.md)
- [시청각 검증 데이터 계약 v0.1](RISK-ZERO_시청각_검증_데이터_계약_v0.1.md)
- [시청각 데이터 수집 가이드 v0.2](RISK-ZERO_시청각_데이터_수집_가이드_v0.1.md)

2026-08-28부터 외부 Parallel DVP Camera를 Arty A7-100T에 직접 연결하고 ESP32-S3 DevKitC를 Door Hub로 사용하는 구조가 현재 기준이다. XIAO/ESP32-CAM UDP 입력과 관련 문서는 이전 구현 이력으로 보관한다. 음성 도어락 제어 요청의 시청각 발화 검증은 `/av`와 관련 문서에 유지한다.

## 기획·발표 자료

- [1차 제안서](1차%20제안서.docx)
- [RISK-ZERO 아이디어 발표 자료](RISK-ZERO%2C%20현관%20위험%20대응%20보조%20도어락%5BPixel-Zero%5D%20아이디어%20발표.pdf)

## 설계·정책 문서

- [현재 구현 현황](implementation-status.md)
- [데이터베이스 설계](database-design.md)
- [모듈 이벤트 버퍼·모바일 동기화](module-sync.md)
- [RISK-ZERO 운영·개인정보·제어 정책 v0.5](RISK-ZERO_Policy_Document_초안_v0.2.md)
- [RISK-ZERO 시청각 검증 판정 및 평가 방안 v0.3](RISK-ZERO_위험도_산정_및_검증_방안_초안_v0.1.md)
- [소프트웨어 다이어그램](Diagram/README.md)
- [모바일 앱 화면](Screenshots/README.md)

## 이전 주제 참고자료

- [ESP32-CAM/XIAO UDP 현관 동선 추적 설계 v0.1](RISK-ZERO_ESP32-CAM_현관_동선_추적_설계_v0.1.md)
- [이전 Arty UDP·MicroBlaze 동선 처리 설계 v0.1](RISK-ZERO_Arty-A7_FPGA_동선_처리_설계_v0.1.md)
- [현관 위험 대응 Use Case v0.2](RISK-ZERO_시나리오_Use_Case_정의서_v0.1.md)
- [개선 백로그 — 2026-07-29](RISK-ZERO_개선_백로그_2026-07-29.md)
- [제품 개발계획 검토 — 2026-07-28](RISK-ZERO_제품_개발계획_검토_2026-07-28.md)
- 1차 제안서와 아이디어 발표 PDF

현재 임계값과 화면 결과는 캡스톤 구현 시험용이다. 실제 모델 정확도나 상용 도어락의 안전 성능을 뜻하지 않는다.
