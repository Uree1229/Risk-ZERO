# RISK-ZERO 현재 구현 현황

- 기준일: 2026-08-18
- 범위: 대학 캡스톤 MVP
- 현재 우선순위: ESP32-CAM 현관 동선 추적
- 유지 기능: 음성 도어락 제어 요청의 시청각 발화 검증

## 구현 완료

| 영역 | 현재 동작 |
| --- | --- |
| ESP32-CAM | QVGA JPEG `/capture`, MJPEG `:81/stream`, 상태 `/health` 펌웨어 소스 |
| 카메라 연결 도구 | 장치 상태 조회와 JPEG 한 장 저장 CLI |
| FPGA 전송 | ESP32 QVGA JPEG를 160×120 GRAY8로 축소해 RZFP UDP 전송 |
| FPGA RTL | 선택 갱신 배경 차이, threshold, 픽셀 수·좌표 합·bbox와 AXI4-Lite |
| MicroBlaze | lwIP UDP 재조립, FPGA 제어, 중심점·구역·체류, HTTP JSON |
| FPGA 웹 연결 | Arty IP 저장, 1초 polling, `fpga-motion/1` 검증·표시 |
| 동선 데이터 계약 | `trajectory-observation/1` 관찰값과 `trajectory-policy/0.1` 판정값 |
| 사람별 추적 | 탐지 상자의 중심점 거리로 ID와 구역별 좌표열 생성 |
| 동선 정책 | 정상 배송·사각지대 이동·60초 내 재접근·인원 불일치·45초 체류·추적 불가 |
| 동선 웹 모니터 | 6개 DEMO, 사람별 경로·수치·이유·대응·최근 이벤트 표시 |
| 데이터 계약 | `av-verification/1` 제어 요청·검증 근거·판정·게이트 구조 |
| Edge 정책 | PASS/BLOCK/INCONCLUSIVE, 품질·싱크·화자·위조 점수 기준 |
| Challenge | 랜덤 문구 발급, 15초 만료, nonce 1회 사용 |
| 제어 게이트 | PASS만 3초간 허용, 만료·재사용·불일치 시 차단 |
| 모형 제어 | 실제 도어락 대신 `MockActuator`로 출력 여부 기록 |
| Edge 테스트 | 시청각 검증·수집·데이터셋·카메라 연결·동선 정책·중심점 추적 41개 |
| 웹 모니터 | 4개 DEMO 시나리오, 검증 근거와 제어 결과 표시 |
| 입력 테스트 | 브라우저 카메라·마이크 동시 녹화, 참여자·공격 유형·거리·조명·재생 장치·소음 기록 |
| 수집 파일 | 세션 ID가 같은 영상과 `av-capture-manifest/2` JSON을 로컬 저장, v1 읽기 호환 |
| 수집 파일 검사 | JSON 스키마·시간·파일명·영상 존재·크기 일치 검사 CLI |
| 데이터셋 인덱스 | 폴더 전체 검사, 상대경로 목록, 참여자·시나리오별 개수와 오류 요약 |
| 모델 연결부 | 실제 추론 없이 흐름만 확인하는 `DemoAVSyncModelAdapter` |
| 웹 API | 센서 이벤트와 검증 시도 저장·조회 |
| 모바일 | 검증 홈, 이벤트·캘린더·상세·영상·설정 |
| 모바일 DB | SQLite v4, 18개 테이블, 요청·검증·근거·제어 로그 저장 |
| 웹 DB | D1 19개 테이블, 검증용 5개 테이블과 마이그레이션 |

## DEMO와 실제 구현의 경계

| 항목 | 현재 상태 | 실제 연결에 필요한 것 |
| --- | --- | --- |
| ESP32-CAM 펌웨어 | 코드 작성 | PlatformIO 설치, 보드 업로드·연속 스트림 시험 |
| FPGA 영상 처리 | RTL·MicroBlaze 소스 작성 | Vivado simulation·합성·timing과 실제 보드 시험 |
| 사람 분류 | 미구현·현재 범위 제외 | 필요하면 별도 AI 가속 보드 또는 작은 CNN 연구 |
| 사람별 추적 | FPGA는 단일 움직임 중심점, Python은 중심점 거리 MVP | 교차·가림을 다룰 re-ID 추적기와 시험 데이터 |
| 배송 행동 | 더미 시나리오 입력 | 택배 구역 체류 또는 물건 내려놓기 탐지 기준 |
| 동선 판정 | 규칙과 임계값 구현 | 실제 영상으로 오탐·누락 측정 후 기준 조정 |
| AV 싱크 | 결정론적 수치 입력 | SyncNet 계열 모델 어댑터와 검증 데이터 |
| 활성 화자 | 결정론적 수치 입력 | TalkNet 계열 모델 어댑터 |
| 재생·합성 탐지 | 결정론적 수치 입력 | ASVspoof 계열 모델과 현관 환경 데이터 |
| 음성 인식 | transcript fixture | ASR 엔진과 challenge 문구 비교 |
| 카메라·마이크 | 웹 브라우저 수집 가능 | 현관 모듈 동시 캡처·타임스탬프 |
| 통신 | 인터페이스와 동기화 로직 | BLE 또는 Wi-Fi `ModuleGateway` |
| 도어락 | 모형 액추에이터 | 절연된 문 모형, 수동 해제, 전원·오류 안전 설계 |
| 인증 | 미구현 | 장치 키, 요청 서명, 사용자 권한 |

## 다음 우선순위

1. ESP32-CAM에 펌웨어를 올리고 같은 Wi-Fi에서 30분 스트림을 시험한다.
2. 실제 설치 위치의 현관·택배·사각지대 구역 좌표를 정한다.
3. Vivado에서 motion RTL simulation, 합성과 timing을 확인한다.
4. MicroBlaze lwIP와 HTTP 상태 출력을 보드에서 실행한다.
5. ESP32→Arty UDP 손실률과 실제 움직임 중심점 오차를 측정한다.
6. 정상 이동·조명 변화·카메라 흔들림·2인 동시 이동을 각 10회 수집한다.
7. 후처리 영상과 동선 이벤트를 기존 DB에 저장하고 모바일 상세 화면에 연결한다.

## 테스트 기준

- Edge 단위 테스트 41개 통과
- FPGA 프로토콜·reference motion 테스트 6개 통과
- 모바일 TypeScript 검사와 단위 테스트
- 모바일 SQLite v4의 18개 테이블 확인
- 수집 manifest 생성·검증 단위 테스트 3개
- 웹 production build, 렌더·API 테스트 11개와 lint 통과
- ESP32-CAM 펌웨어는 이 PC에 PlatformIO가 없어 보드 빌드·업로드 미검증
- Arty RTL·MicroBlaze는 이 PC에 Vivado/Vitis/RTL simulator가 없어 합성·보드 실행 미검증
- 실제 모델 정확도는 아직 측정하지 않음

이번 변경에서는 영상·메타데이터를 서버나 DB로 전송하지 않으며 APK도 빌드하거나 배포하지 않는다. 웹 동선은 DEMO이고 실제 ESP32-CAM·탐지 모델 미연결 상태를 화면에 표시한다.
