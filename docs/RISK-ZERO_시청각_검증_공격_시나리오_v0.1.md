# RISK-ZERO 시청각 검증 공격 시나리오

- 버전: v0.1
- 작성일: 2026-08-11
- 기준 문서: [시청각 발화 검증 시스템 주제 정의서](RISK-ZERO_시청각_발화_검증_주제_정의서_v0.1.md)
- 적용 범위: 통제된 실험실과 문 모형

## 1. 판정 원칙

- `PASS`: 한 명의 판독 가능한 얼굴, 현재 발화, 시청각 싱크, 요청 유효시간과 challenge를 모두 확인했다.
- `BLOCK`: 재생·불일치·만료·challenge 실패처럼 차단 근거가 확인됐다.
- `INCONCLUSIVE`: 데이터가 부족하거나 품질이 낮아 통과와 공격을 구분할 수 없다.
- `INCONCLUSIVE`와 시스템 오류는 문 모형 제어를 허용하지 않는다.
- 싱크 통과는 신원 인증을 의미하지 않는다.

## 2. 필수 시나리오

| ID | 상황 | 입력 특징 | 예상 판정 | 주요 근거 |
| --- | --- | --- | --- | --- |
| AV-01 | 한 사람이 현재 문구를 정상 발화 | 얼굴 1명, 좋은 품질, challenge 일치, 싱크 정상 | `PASS` | sync·active speaker·fresh request |
| AV-02 | 사람이 보이지 않는데 녹음 음성만 재생 | 얼굴 0명, 음성 존재 | `BLOCK` | visible speaker 없음 |
| AV-03 | 사람이 다른 말을 하면서 녹음 음성 재생 | 입술·음성 불일치 | `BLOCK` | sync offset·active speaker 실패 |
| AV-04 | 영상과 음성을 고의로 지연해 재생 | 오프셋 절댓값이 임계값 초과 | `BLOCK` | `av_offset_ms` |
| AV-05 | 휴대전화로 싱크가 맞는 발화 영상 재생 | 싱크는 정상이나 화면 재생 징후 | `BLOCK` 또는 `INCONCLUSIVE` | visual PAD·challenge freshness |
| AV-06 | 합성 음성 또는 음성 변환 결과 재생 | 음성 위조 점수 상승 | `BLOCK` | `audio_spoof_score` |
| AV-07 | 랜덤 문구가 다른 정상 발화 | 음성과 입술은 일치, challenge 불일치 | `BLOCK` | challenge mismatch |
| AV-08 | 이전에 성공한 요청을 다시 전송 | 사용된 nonce 또는 만료 요청 | `BLOCK` | nonce replay·expiry |
| AV-09 | 마스크·손·각도로 입술을 판독하지 못함 | 얼굴은 있으나 mouth quality 저하 | `INCONCLUSIVE` | visual quality |
| AV-10 | 역광·저조도·카메라 흔들림 | 프레임 품질 저하 | `INCONCLUSIVE` | capture quality |
| AV-11 | 공사 소음·바람·동시 대화 | audio quality 저하 | `INCONCLUSIVE` | audio quality·VAD ambiguity |
| AV-12 | 화면에 두 명 이상 있고 발화자 특정 실패 | face count 2 이상 | `INCONCLUSIVE` | active speaker ambiguity |
| AV-13 | 카메라·마이크 시간이 보정 범위를 벗어남 | capture clock drift | `INCONCLUSIVE` | clock sync failure |
| AV-14 | 모델·게이트·통신 오류 | 결과 누락 또는 heartbeat 만료 | `INCONCLUSIVE` | system fault |
| AV-15 | 검증 성공 뒤 제한시간 내 제어 | 유효 PASS와 같은 request ID | `PASS` | gate pulse 허용 |
| AV-16 | 검증 성공 뒤 제한시간 경과 후 제어 | PASS 결과 만료 | `BLOCK` | gate expiry |

## 3. 초기 임계값

다음 값은 제품 성능을 보장하는 기준이 아니라 테스트를 시작하기 위한 설정값이다. 팀 데이터의 개발 세트로 조정한 뒤 테스트 세트에서는 고정한다.

| 항목 | 초기값 | 처리 |
| --- | ---: | --- |
| 시청각 최대 오프셋 | `±200 ms` | 초과 시 `BLOCK` 후보 |
| 싱크 최소 신뢰도 | `0.75` | 미만이면 `INCONCLUSIVE` |
| 활성 화자 최소 점수 | `0.70` | 미만이면 `BLOCK` 후보 |
| 음성 위조 최대 허용 점수 | `0.45` | 이상이면 `BLOCK` 후보 |
| challenge 유효시간 | `15초` | 초과 시 `BLOCK` |
| PASS 제어 유효시간 | `3초` | 초과 시 재검증 |
| 허용 얼굴 수 | `1명` | 0명은 `BLOCK`, 2명 이상은 `INCONCLUSIVE` |

임계값 경계에서 단일 수치만으로 문을 열지 않는다. 요청 유효성, challenge, 데이터 품질과 싱크 조건을 모두 통과해야 한다.

## 4. 테스트 데이터 구성

- 참여자 8~12명
- 시나리오별 5회 이상
- 영상 길이 3~6초
- 거리·각도·조명·소음을 기록
- 같은 참여자의 반복 영상이 개발·테스트 세트 양쪽에 섞이지 않도록 분리
- 원본, 후처리 영상, 모델 출력, 최종 판정을 같은 `attempt_id`로 연결
- 공격 장비의 종류와 재생 거리도 기록

## 5. 측정 지표

| 지표 | 의미 |
| --- | --- |
| 공격 허용률 | 공격 시도 중 `PASS`된 비율 |
| 정상 거부율 | 정상 발화 중 `BLOCK`된 비율 |
| 판단 불가율 | 전체 시도 중 `INCONCLUSIVE` 비율 |
| challenge 실패 탐지율 | 잘못된 문구·만료·nonce 재사용을 차단한 비율 |
| 처리 지연 | 요청부터 판정까지 평균·중앙값·95백분위·최대 |
| 제어 지연 | PASS부터 문 모형 출력까지 걸린 시간 |

전체 정확도만 보고하지 않는다. 시나리오별 공격 허용률과 정상 거부율을 함께 기록한다.

## 6. 시험 기록 형식

각 반복 시험에는 다음을 남긴다.

- `test_case_id`, `attempt_id`, 참여자 가명 ID
- 시나리오 ID와 기대 판정
- 실제 판정과 reason code
- 카메라·마이크 장치, 거리, 조명, 소음 조건
- challenge 문구와 일치 여부
- 얼굴 수, 오프셋, 싱크·활성 화자·위조 점수
- 처리시간, 게이트 출력과 오류
- 모델·정책 버전
- 원본·후처리 파일의 보존 만료시각

## 7. 종료 조건

P0 통합 시험은 AV-01, AV-02, AV-04, AV-07, AV-09, AV-12, AV-14, AV-16을 각각 5회 이상 반복하고 모든 결과를 저장하면 완료로 본다. 실제 정확도 목표는 파일럿 데이터 확인 후 별도로 정한다.
