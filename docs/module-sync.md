# RISK-ZERO 모듈 연동 계약

현관 모듈은 카메라·마이크 원본 분석을 마친 뒤 수치형 근거와 후처리 영상, 제어 요청, 검증 결과를 모바일에 보낸다. 모바일은 모델을 다시 실행하지 않고 저장·표시·게이트 로그를 담당한다.

## ModuleEvent

```text
ModuleEvent
  id, deviceId, sequence, dedupeKey, eventType, capturedAt
  metrics[]
  video?
  controlRequest?
  verification?
  actuation?
```

- `metrics`: 숫자, 단위, 품질, 촬영시각
- `video`: 임시 파일 경로, 크기, 길이, MIME, 체크섬
- `controlRequest`: request ID, 의도, transcript, nonce, 만료
- `verification`: `av-verification/1` 판정과 evidence
- `actuation`: 게이트가 만든 허용 여부와 유효시간

실제 통신 구현은 `mobile/src/module/contracts.ts`의 `ModuleGateway`를 따른다.

## 동기화 순서

1. 모바일이 마지막 수신 sequence 다음부터 최대 N개를 요청한다.
2. 모듈이 이벤트와 후처리 영상 임시 경로를 반환한다.
3. 모바일이 영상을 앱 전용 저장소로 복사하고 크기를 검증한다.
4. SQLite transaction에 이벤트·metric·영상·요청·검증·근거·게이트를 저장한다.
5. transaction 성공 후 마지막 sequence까지 ACK한다.
6. 모듈은 ACK된 임시 파일과 버퍼를 정리한다.

저장이나 복사가 실패하면 ACK하지 않는다. 재연결 시 같은 dedupe key는 중복 저장하지 않는다.

## 시간 동기화

AV 싱크는 영상과 음성이 같은 시간축을 가져야 한다. 하드웨어는 다음 중 하나를 보장해야 한다.

- 동일 캡처 파이프라인의 컨테이너 타임스탬프
- 공통 monotonic clock과 시작시각
- 오디오·비디오 offset 보정값과 clock synchronization 상태

시계 동기화가 확인되지 않으면 `clockSynchronized=false`로 보내고 SW는 PASS하지 않는다.

## 버퍼 유실

모듈의 `oldestAvailableSequence`가 모바일의 다음 기대 sequence보다 크면 중간 데이터가 유실된 것이다. 모바일은 유실 구간을 장치 오류로 표시하고 이후 이벤트를 계속 받되, 유실 사실을 정상 발화로 해석하지 않는다.

## 현재 구현과 남은 작업

구현됨:

- 메모리 이벤트 버퍼, pull·ACK·중복 제거
- 영상 복사와 크기 확인
- SQLite v4 저장
- 검증 결과·근거·게이트 저장

남음:

- 실제 BLE/Wi-Fi `ModuleGateway`
- 현관 보드 파일 전송과 체크섬 검증
- 모듈·모바일 장치 인증과 요청 서명
- 백그라운드 수신·재연결 실기기 시험
